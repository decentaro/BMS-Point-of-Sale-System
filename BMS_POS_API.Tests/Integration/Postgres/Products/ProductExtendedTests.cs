using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Products
{
    [Collection("Postgres")]
    public class ProductExtendedTests : IntegrationTestBase
    {
        public ProductExtendedTests(PostgresFixture fixture) : base(fixture) { }

        // ── GET /api/products/{id} ──

        [Fact]
        public async Task GetProductById_Exists_ReturnsProduct()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("GPI-001", 25.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync($"/api/products/{productId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("barcode").GetString().Should().Be("GPI-001");
        }

        [Fact]
        public async Task GetProductById_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── PUT /api/products/{id} ──

        [Fact]
        public async Task UpdateProduct_ValidInput_Succeeds()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("UPD-001", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);

            var updatePayload = new
            {
                Id = productId,
                Barcode = product!.Barcode,
                Name = "Updated Product Name",
                Price = 75.00m,
                Cost = 30.00m,
                StockQuantity = product.StockQuantity,
                MinStockLevel = product.MinStockLevel,
                Unit = product.Unit,
                IsActive = true,
                CreatedDate = product.CreatedDate
            };

            var response = await client.PutAsJsonAsync($"/api/products/{productId}", updatePayload);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            await using var verify = Fixture.CreateContext();
            var updated = await verify.Products.FindAsync(productId);
            updated!.Name.Should().Be("Updated Product Name");
            updated.Price.Should().Be(75.00m);
        }

        [Fact]
        public async Task UpdateProduct_IdMismatch_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("MIS-001", 50.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Id = productId + 1, Barcode = "MIS-001", Name = "X", Price = 50m, Cost = 25m, StockQuantity = 10, MinStockLevel = 1, Unit = "pcs", IsActive = true };
            var response = await client.PutAsJsonAsync($"/api/products/{productId}", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task UpdateProduct_DuplicateBarcode_Returns400()
        {
            await ResetAndSeedAsync();
            await SeedProductAsync("DUP-A01", 10.00m, 5);
            var productId = await SeedProductAsync("DUP-B01", 20.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);

            var payload = new
            {
                Id = productId, Barcode = "DUP-A01", Name = product!.Name,
                Price = product.Price, Cost = product.Cost,
                StockQuantity = product.StockQuantity, MinStockLevel = product.MinStockLevel,
                Unit = product.Unit, IsActive = true, CreatedDate = product.CreatedDate
            };

            var response = await client.PutAsJsonAsync($"/api/products/{productId}", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Barcode already exists");
        }

        [Fact]
        public async Task UpdateProduct_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Id = 999999, Barcode = "X", Name = "X", Price = 10m, Cost = 5m, StockQuantity = 1, MinStockLevel = 1, Unit = "pcs", IsActive = true };
            var response = await client.PutAsJsonAsync("/api/products/999999", payload);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── Barcode validation ──

        [Fact]
        public async Task CreateProduct_InvalidBarcodeChars_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "BAD\tCODE", Name = "Test", Price = 10m, Cost = 5m, StockQuantity = 1, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("invalid characters");
        }

        [Fact]
        public async Task CreateProduct_EmptyName_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "EN-001", Name = "", Price = 10m, Cost = 5m, StockQuantity = 1, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Name");
        }

        // ── GET /api/products/expiring ──

        [Fact]
        public async Task GetExpiringProducts_NoBatches_ReturnsEmpty()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/expiring?days=30");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        // ── GET/POST /api/products/{id}/batches ──

        [Fact]
        public async Task GetProductBatches_NoBatches_ReturnsEmpty()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("BAT-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync($"/api/products/{productId}/batches");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetProductBatches_ProductNotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/999999/batches");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateBatch_ValidInput_Succeeds()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("CBT-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
            {
                BatchNumber = "BATCH-2026-001",
                Quantity = 100,
                CostPerUnit = 8.00m,
                Supplier = "Test Supplier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(105, "batch quantity added to existing stock");
        }

        [Fact]
        public async Task CreateBatch_DuplicateBatchNumber_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("DBN-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new { BatchNumber = "DUP-BATCH", Quantity = 10, CostPerUnit = 5m };
            await client.PostAsJsonAsync($"/api/products/{productId}/batches", payload);

            var response = await client.PostAsJsonAsync($"/api/products/{productId}/batches", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already exists");
        }

        [Fact]
        public async Task CreateBatch_ZeroQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("ZBQ-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
            {
                BatchNumber = "ZQ-BATCH", Quantity = 0, CostPerUnit = 5m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("greater than zero");
        }

        [Fact]
        public async Task CreateBatch_NegativeCost_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("NBC-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
            {
                BatchNumber = "NC-BATCH", Quantity = 10, CostPerUnit = -1m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("negative");
        }

        [Fact]
        public async Task CreateBatch_ProductNotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/products/999999/batches", new
            {
                BatchNumber = "NF-BATCH", Quantity = 10, CostPerUnit = 5m
            });

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateBatch_EmptyBatchNumber_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("EBN-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync($"/api/products/{productId}/batches", new
            {
                BatchNumber = "", Quantity = 10, CostPerUnit = 5m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("required");
        }

        // ── Low stock boundary ──

        [Fact]
        public async Task GetLowStockProducts_AtExactMinLevel_Included()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Products.Add(new Product
            {
                Barcode = "LSB-001", Name = "Low Stock Boundary",
                Price = 10m, Cost = 5m, StockQuantity = 5, MinStockLevel = 5,
                Unit = "pcs", IsActive = true, CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/low-stock");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var products = doc.RootElement.EnumerateArray().ToList();
            products.Should().Contain(p => p.GetProperty("barcode").GetString() == "LSB-001",
                "stock == minStockLevel should be included (<=)");
        }

        // ── Soft delete then barcode reuse ──

        [Fact]
        public async Task DeleteProduct_ThenGetByBarcode_Returns404()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("DEL-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var deleteResp = await client.DeleteAsync($"/api/products/{productId}");
            deleteResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

            var getResp = await client.GetAsync("/api/products/barcode/DEL-001");
            getResp.StatusCode.Should().Be(HttpStatusCode.NotFound,
                "soft-deleted products should not appear in barcode lookup");
        }
    }
}
