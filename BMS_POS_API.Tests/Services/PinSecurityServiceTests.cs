using BMS_POS_API.Services;
using FluentAssertions;

namespace BMS_POS_API.Tests.Services
{
    public class PinSecurityServiceTests
    {
        private readonly PinSecurityService _svc = new();

        // ── HashPin ──────────────────────────────────────────────

        [Fact]
        public void HashPin_ReturnsNonEmptyHash()
        {
            var hash = _svc.HashPin("1234");
            hash.Should().NotBeNullOrWhiteSpace();
        }

        [Fact]
        public void HashPin_ReturnsBCryptHash()
        {
            var hash = _svc.HashPin("1234");
            hash.Should().StartWith("$2");
        }

        [Fact]
        public void HashPin_DifferentSaltsPerCall()
        {
            var h1 = _svc.HashPin("1234");
            var h2 = _svc.HashPin("1234");
            h1.Should().NotBe(h2); // Different salts each time
        }

        [Fact]
        public void HashPin_NullOrWhiteSpaceThrows()
        {
            Action hashNull = () => _svc.HashPin(null!);
            Action hashEmpty = () => _svc.HashPin("");
            Action hashWhitespace = () => _svc.HashPin("   ");

            hashNull.Should().Throw<ArgumentException>();
            hashEmpty.Should().Throw<ArgumentException>();
            hashWhitespace.Should().Throw<ArgumentException>();
        }

        [Theory]
        [InlineData("1234")]
        [InlineData("0000")]
        [InlineData("999999")]
        [InlineData("abc123")]
        public void HashPin_VariousPins_ProduceBCryptHash(string pin)
        {
            var hash = _svc.HashPin(pin);
            hash.Should().StartWith("$2");
        }

        // ── VerifyPin ─────────────────────────────────────────────

        [Fact]
        public void VerifyPin_CorrectPin_ReturnsTrue()
        {
            var hash = _svc.HashPin("1234");
            _svc.VerifyPin("1234", hash).Should().BeTrue();
        }

        [Fact]
        public void VerifyPin_WrongPin_ReturnsFalse()
        {
            var hash = _svc.HashPin("1234");
            _svc.VerifyPin("9999", hash).Should().BeFalse();
        }

        [Fact]
        public void VerifyPin_EmptyPin_ReturnsFalse()
        {
            var hash = _svc.HashPin("1234");
            _svc.VerifyPin("", hash).Should().BeFalse();
        }

        [Fact]
        public void VerifyPin_NullPin_ReturnsFalse()
        {
            var hash = _svc.HashPin("1234");
            _svc.VerifyPin(null!, hash).Should().BeFalse();
        }

        [Fact]
        public void VerifyPin_EmptyHash_ReturnsFalse()
        {
            _svc.VerifyPin("1234", "").Should().BeFalse();
        }

        [Fact]
        public void VerifyPin_NullHash_ReturnsFalse()
        {
            _svc.VerifyPin("1234", null!).Should().BeFalse();
        }

        [Fact]
        public void VerifyPin_InvalidHashFormat_ReturnsFalse()
        {
            // Garbage hash — BCrypt.Verify throws internally, should return false
            _svc.VerifyPin("1234", "not-a-bcrypt-hash").Should().BeFalse();
        }

        [Fact]
        public void VerifyPin_CaseSensitive()
        {
            var hash = _svc.HashPin("PinABC");
            _svc.VerifyPin("pinabc", hash).Should().BeFalse();
        }

        [Theory]
        [InlineData("1234")]
        [InlineData("0000")]
        [InlineData("999999")]
        public void VerifyPin_HashVerifyRoundTrip(string pin)
        {
            var hash = _svc.HashPin(pin);
            _svc.VerifyPin(pin, hash).Should().BeTrue();
        }

        // ── IsLegacyPin ──────────────────────────────────────────

        [Fact]
        public void IsLegacyPin_PlaintextPin_ReturnsTrue()
        {
            _svc.IsLegacyPin("1234").Should().BeTrue();
        }

        [Fact]
        public void IsLegacyPin_BCryptHash_ReturnsFalse()
        {
            var hash = _svc.HashPin("1234");
            _svc.IsLegacyPin(hash).Should().BeFalse();
        }

        [Fact]
        public void IsLegacyPin_EmptyString_ReturnsFalse()
        {
            _svc.IsLegacyPin("").Should().BeFalse();
        }

        [Fact]
        public void IsLegacyPin_NullPin_ReturnsFalse()
        {
            _svc.IsLegacyPin(null!).Should().BeFalse();
        }

        [Fact]
        public void IsLegacyPin_WhitespacePin_ReturnsFalse()
        {
            _svc.IsLegacyPin("   ").Should().BeFalse();
        }

        [Theory]
        [InlineData("$2a$12$somethinglong", false)]
        [InlineData("$2b$10$anotherhash", false)]
        [InlineData("1234", true)]
        [InlineData("hello", true)]
        [InlineData("$1$notbcrypt", true)] // starts with $1, not $2
        public void IsLegacyPin_VariousInputs_CorrectResult(string pin, bool expectedLegacy)
        {
            _svc.IsLegacyPin(pin).Should().Be(expectedLegacy);
        }

        // ── Rare Edge Cases ───────────────────────────────────────

        [Fact]
        public void VerifyPin_LegacyPlaintextStoredAsHash_ReturnsFalse()
        {
            // If someone stored a plaintext PIN in the DB and we try to BCrypt-verify it
            // against itself, it should fail (plaintext != valid bcrypt hash)
            _svc.VerifyPin("1234", "1234").Should().BeFalse();
        }

        [Fact]
        public void HashPin_VeryLongPin_ProducesValidHash()
        {
            var longPin = new string('9', 100);
            var hash = _svc.HashPin(longPin);
            hash.Should().StartWith("$2");
            // BCrypt truncates at 72 bytes — that's its documented limit
            // Verify the truncated version still matches
            _svc.VerifyPin(longPin, hash).Should().BeTrue();
        }
    }
}
