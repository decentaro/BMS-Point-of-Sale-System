using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Products
{
    [Collection("Postgres")]
    public class ProductCrudTests : IntegrationTestBase
    {
        public ProductCrudTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task CreateProduct_ValidInput_Returns201()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "PROD-NEW-001",
                Name = "New Product",
                Price = 19.99m,
                Cost = 10.00m,
                StockQuantity = 50,
                MinStockLevel = 5,
                Unit = "pcs",
                IsActive = true
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var product = await verify.Products.SingleOrDefaultAsync(p => p.Barcode == "PROD-NEW-001");
            product.Should().NotBeNull();
            product!.Price.Should().Be(19.99m);
            product.StockQuantity.Should().Be(50);
        }

        [Fact]
        public async Task CreateProduct_DuplicateBarcode_Returns400()
        {
            await ResetAndSeedAsync();
            await SeedProductAsync("DUP-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "DUP-001",
                Name = "Duplicate",
                Price = 10.00m,
                Cost = 5.00m,
                StockQuantity = 1
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Barcode already exists");
        }

        [Fact]
        public async Task CreateProduct_EmptyBarcode_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "",
                Name = "No Barcode",
                Price = 10.00m,
                Cost = 5.00m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateProduct_ZeroPrice_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "ZEROPRC",
                Name = "Free Product",
                Price = 0m,
                Cost = 0m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("greater than zero");
        }

        [Fact]
        public async Task CreateProduct_NegativeCost_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "NEGCOST",
                Name = "Negative Cost",
                Price = 10.00m,
                Cost = -5.00m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("negative");
        }

        [Fact]
        public async Task CreateProduct_NegativeStock_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "NEGSTK",
                Name = "Negative Stock",
                Price = 10.00m,
                Cost = 5.00m,
                StockQuantity = -1
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetProducts_ReturnsActiveOnly()
        {
            await ResetAndSeedAsync();
            await SeedProductAsync("ACTIVE-1", 10.00m, 5);

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Products.Add(new Product
                {
                    Barcode = "INACT-1",
                    Name = "Inactive Product",
                    Price = 5.00m,
                    Cost = 2.00m,
                    StockQuantity = 10,
                    IsActive = false,
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var products = doc.RootElement.EnumerateArray().ToList();
            products.Should().Contain(p => p.GetProperty("barcode").GetString() == "ACTIVE-1");
            products.Should().NotContain(p => p.GetProperty("barcode").GetString() == "INACT-1");
        }

        [Fact]
        public async Task GetProductByBarcode_Found_ReturnsProduct()
        {
            await ResetAndSeedAsync();
            await SeedProductAsync("FIND-ME", 25.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/barcode/FIND-ME");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("barcode").GetString().Should().Be("FIND-ME");
        }

        [Fact]
        public async Task GetProductByBarcode_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/barcode/NOPE");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task GetLowStockProducts_ReturnsCorrectProducts()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Products.AddRange(
                    new Product { Barcode = "LOW-1", Name = "Low Stock", Price = 10, Cost = 5, StockQuantity = 1, MinStockLevel = 5, IsActive = true, CreatedDate = DateTime.UtcNow },
                    new Product { Barcode = "OK-1", Name = "OK Stock", Price = 10, Cost = 5, StockQuantity = 50, MinStockLevel = 5, IsActive = true, CreatedDate = DateTime.UtcNow }
                );
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/products/low-stock");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var products = doc.RootElement.EnumerateArray().ToList();
            products.Should().Contain(p => p.GetProperty("barcode").GetString() == "LOW-1");
            products.Should().NotContain(p => p.GetProperty("barcode").GetString() == "OK-1");
        }

        [Fact]
        public async Task DeleteProduct_SoftDeletes()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("DEL-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.DeleteAsync($"/api/products/{productId}");
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            await using var verify = Fixture.CreateContext();
            var product = await verify.Products.FindAsync(productId);
            product.Should().NotBeNull("soft-delete should not remove the row");
            product!.IsActive.Should().BeFalse();
        }

        [Fact]
        public async Task UpdateStock_ValidInput_Succeeds()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("STK-UPD", 10.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync($"/api/products/{productId}/stock", new
            {
                NewQuantity = 35,
                Reason = "Restocked"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var product = await verify.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(35);
        }

        [Fact]
        public async Task UpdateStock_NegativeQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("STK-NEG", 10.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync($"/api/products/{productId}/stock", new
            {
                NewQuantity = -1
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CashierCannotCreateProduct_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.PostAsJsonAsync("/api/products", new
            {
                Barcode = "UNAUTH1",
                Name = "Unauthorized Product",
                Price = 10.00m,
                Cost = 5.00m
            });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
