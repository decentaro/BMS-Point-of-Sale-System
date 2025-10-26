using Microsoft.EntityFrameworkCore;
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
    options.UseNpgsql(processedConnectionString);
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

// Add Health Checks with secure connection string
builder.Services.AddHealthChecks()
    .AddNpgSql(secureConfig.ProcessConnectionString(builder.Configuration.GetConnectionString("DefaultConnection")!), name: "database");

// Add CORS for Electron frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("ElectronPolicy", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Ensure database is created and apply migrations
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
    context.Database.Migrate(); // This applies pending migrations
    
    // Enable real-time functionality for all tables after migration
    await context.EnableRealTimeForAllTablesAsync();
    
    // Create default admin accounts if database is empty, or update existing users' roles
    var existingEmployees = context.Employees.ToList();
    
    if (!existingEmployees.Any())
    {
        // Database is empty - create default manager account
        var defaultManager = new BMS_POS_API.Models.Employee
        {
            EmployeeId = "0001",
            Pin = "1234",
            Name = "Manager",
            Role = "Manager",
            IsManager = true,
            IsActive = true,
            CreatedDate = DateTime.UtcNow
        };
        
        context.Employees.Add(defaultManager);
        context.SaveChanges();
        Console.WriteLine("Created default manager account:");
        Console.WriteLine("0001 = Manager (PIN: 1234)");
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

// Add comprehensive request logging (after exception handler)
app.UseMiddleware<RequestLoggingMiddleware>();

app.UseCors("ElectronPolicy");

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
