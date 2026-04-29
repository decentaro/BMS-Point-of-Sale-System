using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;
using BMS_POS_API.Data;
using BMS_POS_API.Services;
using BMS_POS_API.Models;
using BMS_POS_API.Middleware;
using BMS_POS_API.Extensions;
using Serilog;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);

// Initialize secure configuration
var secureConfig = new SecureConfigurationService();
secureConfig.EnsureEnvironmentVariables();

// Create logs directory if it doesn't exist
Directory.CreateDirectory("logs");

// Configure comprehensive Serilog - structured logging covering all bases
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Application", "BMS_POS")
    .WriteTo.Console()
    .WriteTo.File(path: "logs/comprehensive-.json", 
                  rollingInterval: RollingInterval.Day,
                  formatter: new Serilog.Formatting.Json.JsonFormatter())
    .CreateLogger();

builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.WriteIndented = true;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add Entity Framework with PostgreSQL (Supabase) - with secure configuration
builder.Services.AddDbContext<BmsPosDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    var processedConnectionString = secureConfig.ProcessConnectionString(connectionString!);

    // Apply pool tuning on top of whatever the base connection string specifies
    var csb = new Npgsql.NpgsqlConnectionStringBuilder(processedConnectionString)
    {
        MaxPoolSize = 50,   // cap concurrent DB connections per process
        MinPoolSize = 2,    // keep a couple warm to avoid cold-start latency
        ConnectionIdleLifetime = 300  // recycle idle connections after 5 min
    };

    options.UseNpgsql(csb.ConnectionString, npgsql =>
    {
        npgsql.CommandTimeout(60);   // cancel queries running longer than 60 s
    });
});


// Add UserActivity service
builder.Services.AddScoped<IUserActivityService, UserActivityService>();

// Add PIN Security service
builder.Services.AddScoped<IPinSecurityService, PinSecurityService>();

// Add Secure Configuration service
builder.Services.AddSingleton<ISecureConfigurationService, SecureConfigurationService>();

// Add Metrics service for business intelligence
builder.Services.AddScoped<IMetricsService, MetricsService>();

// Add Supabase Backup service
builder.Services.AddScoped<ISupabaseBackupService, SupabaseBackupService>();

// Add memory cache (used by lockout service)
builder.Services.AddMemoryCache();

// Add login lockout service (DB-backed — survives restarts)
builder.Services.AddSingleton<ILoginLockoutService, LoginLockoutService>();

// Add JWT secret holder (generates a random secret on startup)
var jwtSecretHolder = new JwtSecretHolder();
builder.Services.AddSingleton(jwtSecretHolder);
builder.Services.AddSingleton<BMS_POS_API.Services.TokenDenylistService>();

// Add JWT authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretHolder.Secret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero
        };
        options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var denylist = context.HttpContext.RequestServices
                    .GetRequiredService<BMS_POS_API.Services.TokenDenylistService>();
                var jti = context.Principal?.FindFirst(
                    System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Jti)?.Value;
                if (jti != null && denylist.IsRevoked(jti))
                    context.Fail("Token has been revoked");
                return Task.CompletedTask;
            }
        };
    });

// Rate limiting: strict auth limit + global API limit
builder.Services.AddRateLimiter(options =>
{
    // Auth endpoints: 10 requests per 5 minutes per IP
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(5),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            }));

    // Global fallback: 300 requests per minute per IP — generous for a kiosk,
    // blocks runaway loops or local DoS against the backend
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 300,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            }));

    options.RejectionStatusCode = 429;
});

// Add Health Checks with secure connection string
builder.Services.AddHealthChecks()
    .AddNpgSql(secureConfig.ProcessConnectionString(builder.Configuration.GetConnectionString("DefaultConnection")!), name: "database");

// Add CORS for Electron frontend (localhost only - desktop app)
builder.Services.AddCors(options =>
{
    options.AddPolicy("ElectronPolicy", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
              {
                  // Electron renderer sends a null origin — always allow
                  if (string.IsNullOrEmpty(origin) || origin == "null") return true;
                  try
                  {
                      var uri = new Uri(origin);
                      // Require http scheme (block https on arbitrary ports, ws, etc.)
                      // and restrict to loopback addresses only
                      return uri.Scheme == "http"
                          && (uri.Host == "localhost" || uri.Host == "127.0.0.1");
                  }
                  catch { return false; }
              })
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Ensure database is created and apply migrations
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
    var providerName = context.Database.ProviderName ?? "";
    if (!providerName.Contains("InMemory"))
    {
        await context.Database.MigrateAsync();
        await context.EnableRealTimeForAllTablesAsync();
    }
    else
    {
        context.Database.EnsureCreated(); // InMemory (used in tests)
    }
    
    // Create default admin accounts if database is empty, or update existing users' roles
    var existingEmployees = context.Employees.ToList();
    
    if (!existingEmployees.Any())
    {
        // Database is empty - create default manager account with hashed PIN
        var pinService = scope.ServiceProvider.GetRequiredService<IPinSecurityService>();
        var defaultManager = new BMS_POS_API.Models.Employee
        {
            EmployeeId = "0001",
            Pin = pinService.HashPin("1234"),
            Name = "Manager",
            Role = "Manager",
            IsManager = true,
            IsActive = true,
            CreatedDate = DateTime.UtcNow,
            MustChangePinOnNextLogin = true
        };

        context.Employees.Add(defaultManager);
        context.SaveChanges();
        Console.WriteLine("Created default manager account (PIN is hashed). Change PIN immediately after first login.");
    }
    else
    {
        // Update existing users' roles if they don't have roles set
        var usersWithoutRoles = existingEmployees.Where(e => string.IsNullOrEmpty(e.Role)).ToList();
        if (usersWithoutRoles.Any())
        {
            foreach (var user in usersWithoutRoles)
            {
                // Default role for existing users
                user.Role = user.IsManager ? "Manager" : "Cashier";
            }
            
            context.SaveChanges();
            Console.WriteLine($"Updated roles for {usersWithoutRoles.Count} existing users");
        }
    }
}

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Add Global Exception Handler (before other middleware)
app.UseMiddleware<GlobalExceptionMiddleware>();

// Add security headers
app.UseMiddleware<SecurityHeadersMiddleware>();

// Add comprehensive request logging (after exception handler)
app.UseMiddleware<RequestLoggingMiddleware>();

app.UseCors("ElectronPolicy");

app.UseRateLimiter();

// Serve static files from uploads directory
var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "uploads");
if (!Directory.Exists(uploadsPath))
{
    Directory.CreateDirectory(uploadsPath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

app.UseAuthentication();

// Overwrite X-User-Id / X-User-Name headers with validated JWT claim values
// so controllers always see the real authenticated identity (P1-5)
app.UseMiddleware<ClaimsEnforcementMiddleware>();

app.UseAuthorization();

// Add Health Check endpoints
app.MapHealthChecks("/health");
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = _ => false
});

app.MapControllers();

app.Run();

public partial class Program { }
