using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Products
{
    [Collection("Postgres")]
    public class ProductRareEdgeCaseTests : IntegrationTestBase
    {
        public ProductRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task DeleteProduct_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.DeleteAsync("/api/products/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task DeleteProduct_AlreadyDeleted_Returns404()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("DEL-TWICE", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var first = await client.DeleteAsync($"/api/products/{productId}");
            first.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Second delete should still succeed — soft delete on the same record
            // The product still exists in DB (IsActive=false), so FindAsync finds it
            var second = await client.DeleteAsync($"/api/products/{productId}");
            second.StatusCode.Should().Be(HttpStatusCode.NoContent,
                "soft-deleting an already-inactive product should still return 204");
        }

        [Fact]
        public async Task UpdateStock_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync("/api/products/999999/stock",
                new { NewQuantity = 10 });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task UpdateStock_SetToZero_Succeeds()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("STK-ZERO", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync($"/api/products/{productId}/stock",
                new { NewQuantity = 0 });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(0);
        }

        [Fact]
        public async Task UpdateStock_NegativeQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("STK-NEG", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync($"/api/products/{productId}/stock",
                new { NewQuantity = -1 });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateProduct_ZeroPrice_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "ZP-001", Name = "Zero Price", Price = 0m, Cost = 0m, StockQuantity = 10, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Price must be greater than zero");
        }

        [Fact]
        public async Task CreateProduct_NegativeCost_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "NC-001", Name = "Neg Cost", Price = 10m, Cost = -5m, StockQuantity = 10, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Cost cannot be negative");
        }

        [Fact]
        public async Task CreateProduct_NegativeStock_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "NS-001", Name = "Neg Stock", Price = 10m, Cost = 5m, StockQuantity = -1, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Stock quantity cannot be negative");
        }

        [Fact]
        public async Task CreateProduct_DuplicateBarcode_Returns400()
        {
            await ResetAndSeedAsync();
            await SeedProductAsync("DUPE-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "DUPE-001", Name = "Duplicate", Price = 10m, Cost = 5m, StockQuantity = 1, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Barcode already exists");
        }

        [Fact]
        public async Task CreateProduct_EmptyBarcode_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Barcode = "", Name = "No Barcode", Price = 10m, Cost = 5m, StockQuantity = 1, MinStockLevel = 1, Unit = "pcs" };
            var response = await client.PostAsJsonAsync("/api/products", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetProducts_ExcludesSoftDeleted()
        {
            await ResetAndSeedAsync();
            var activeId = await SeedProductAsync("ACTIVE-001", 10.00m, 5);
            var deletedId = await SeedProductAsync("DELETED-001", 10.00m, 5);

            await using var ctx = Fixture.CreateContext();
            var deleted = await ctx.Products.FindAsync(deletedId);
            deleted!.IsActive = false;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var barcodes = doc.RootElement.EnumerateArray()
                .Select(p => p.GetProperty("barcode").GetString())
                .ToList();

            barcodes.Should().Contain("ACTIVE-001");
            barcodes.Should().NotContain("DELETED-001",
                "soft-deleted products must not appear in GET /api/products");
        }

        [Fact]
        public async Task GetProductById_ReturnsSoftDeletedProduct()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("SOFT-DEL", 10.00m, 5);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.IsActive = false;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // GET by ID uses FindAsync which doesn't filter IsActive
            var response = await client.GetAsync($"/api/products/{productId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "GET by ID returns even soft-deleted products (for admin/audit)");
        }

        [Fact]
        public async Task UpdateProduct_InvalidBarcodeChars_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("UPD-BAD", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.AsNoTracking().FirstAsync(p => p.Id == productId);

            var payload = new
            {
                Id = productId,
                Barcode = "BAD\x01CODE",
                Name = product.Name,
                Price = product.Price,
                Cost = product.Cost,
                StockQuantity = product.StockQuantity,
                MinStockLevel = product.MinStockLevel,
                Unit = product.Unit,
                IsActive = true,
                CreatedDate = product.CreatedDate
            };

            var response = await client.PutAsJsonAsync($"/api/products/{productId}", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("invalid characters");
        }
    }
}
