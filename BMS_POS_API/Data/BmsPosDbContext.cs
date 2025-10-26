using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Models;
using Npgsql;

namespace BMS_POS_API.Data
{
    public class BmsPosDbContext : DbContext
    {
        public BmsPosDbContext(DbContextOptions<BmsPosDbContext> options) : base(options)
        {
        }

        public DbSet<Employee> Employees { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Sale> Sales { get; set; }
        public DbSet<SaleItem> SaleItems { get; set; }
        public DbSet<TaxSettings> TaxSettings { get; set; }
        public DbSet<SystemSettings> SystemSettings { get; set; }
        public DbSet<Return> Returns { get; set; }
        public DbSet<ReturnItem> ReturnItems { get; set; }
        public DbSet<UserActivity> UserActivities { get; set; }
        public DbSet<StockAdjustment> StockAdjustments { get; set; }
        public DbSet<ProductBatch> ProductBatches { get; set; }
        public DbSet<InventoryCount> InventoryCounts { get; set; }
        public DbSet<InventoryCountItem> InventoryCountItems { get; set; }
        public DbSet<AdminSettings> AdminSettings { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure consistent snake_case table names
            modelBuilder.Entity<Employee>().ToTable("employees");
            modelBuilder.Entity<Product>().ToTable("products"); 
            modelBuilder.Entity<Sale>().ToTable("sales");
            modelBuilder.Entity<SaleItem>().ToTable("sale_items");
            modelBuilder.Entity<TaxSettings>().ToTable("tax_settings");
            modelBuilder.Entity<SystemSettings>().ToTable("system_settings");
            modelBuilder.Entity<Return>().ToTable("returns");
            modelBuilder.Entity<ReturnItem>().ToTable("return_items");
            modelBuilder.Entity<UserActivity>().ToTable("user_activities");
            modelBuilder.Entity<StockAdjustment>().ToTable("stock_adjustments");
            modelBuilder.Entity<ProductBatch>().ToTable("product_batches");
            modelBuilder.Entity<InventoryCount>().ToTable("inventory_counts");
            modelBuilder.Entity<InventoryCountItem>().ToTable("inventory_count_items");
            modelBuilder.Entity<AdminSettings>().ToTable("admin_settings");

            // Create initial admin user only if no users exist
            // This will be handled by the startup logic instead of seed data
        }

        public override int SaveChanges()
        {
            ConvertDateTimesToUtc();
            return base.SaveChanges();
        }

        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            ConvertDateTimesToUtc();
            return base.SaveChangesAsync(cancellationToken);
        }

        private void ConvertDateTimesToUtc()
        {
            var entries = ChangeTracker.Entries()
                .Where(e => e.State == EntityState.Added || e.State == EntityState.Modified);

            foreach (var entry in entries)
            {
                foreach (var property in entry.Properties)
                {
                    if (property.CurrentValue is DateTime dateTime)
                    {
                        if (dateTime.Kind != DateTimeKind.Utc)
                        {
                            // Convert to UTC if not already UTC
                            property.CurrentValue = DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Enables real-time functionality for all tables in the database.
        /// This should be called after database migration to enable Supabase real-time subscriptions.
        /// </summary>
        public async Task EnableRealTimeForAllTablesAsync()
        {
            try
            {
                var tableNames = new[]
                {
                    "employees", "products", "sales", "sale_items", 
                    "tax_settings", "system_settings", "returns", "return_items",
                    "user_activities", "stock_adjustments", "product_batches",
                    "inventory_counts", "inventory_count_items", "admin_settings"
                };

                foreach (var tableName in tableNames)
                {
                    // Enable real-time for each table using Supabase's real-time functionality
                    var sql = $"ALTER TABLE {tableName} REPLICA IDENTITY FULL;";
                    await Database.ExecuteSqlRawAsync(sql);
                    
                    // Enable row level security if not already enabled
                    var rlsSql = $"ALTER TABLE {tableName} ENABLE ROW LEVEL SECURITY;";
                    try 
                    {
                        await Database.ExecuteSqlRawAsync(rlsSql);
                    }
                    catch
                    {
                        // RLS might already be enabled or not supported, continue
                    }
                }

                // Add the tables to the realtime publication
                var realtimePublicationSql = string.Join(", ", tableNames.Select(t => $"'{t}'"));
                var addToRealtimeSql = $"ALTER PUBLICATION supabase_realtime ADD TABLE {string.Join(", ", tableNames)};";
                
                try
                {
                    await Database.ExecuteSqlRawAsync(addToRealtimeSql);
                }
                catch
                {
                    // Publication might not exist or tables already added, this is optional
                }

                Console.WriteLine("Real-time functionality enabled for all tables");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Could not enable real-time for some tables: {ex.Message}");
                // Don't throw - this is not critical for basic functionality
            }
        }
    }
}