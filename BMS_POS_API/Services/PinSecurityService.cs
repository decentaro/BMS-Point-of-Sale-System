using BCrypt.Net;

namespace BMS_POS_API.Services
{
    public interface IPinSecurityService
    {
        string HashPin(string plainTextPin);
        bool VerifyPin(string plainTextPin, string hashedPin);
        bool IsLegacyPin(string pin);
    }

    public class PinSecurityService : IPinSecurityService
    {
        private const int WorkFactor = 12; // BCrypt work factor (cost)
        
        /// <summary>
        /// Hashes a plaintext PIN using BCrypt with salt
        /// </summary>
        /// <param name="plainTextPin">The plaintext PIN to hash</param>
        /// <returns>BCrypt hashed PIN with salt</returns>
        public string HashPin(string plainTextPin)
        {
            if (string.IsNullOrWhiteSpace(plainTextPin))
                throw new ArgumentException("PIN cannot be null or empty", nameof(plainTextPin));

            // BCrypt automatically generates salt and includes it in the hash
            return BCrypt.Net.BCrypt.HashPassword(plainTextPin, WorkFactor);
        }

        /// <summary>
        /// Verifies a plaintext PIN against a hashed PIN
        /// </summary>
        /// <param name="plainTextPin">The plaintext PIN to verify</param>
        /// <param name="hashedPin">The hashed PIN to verify against</param>
        /// <returns>True if PIN matches, false otherwise</returns>
        public bool VerifyPin(string plainTextPin, string hashedPin)
        {
            if (string.IsNullOrWhiteSpace(plainTextPin) || string.IsNullOrWhiteSpace(hashedPin))
                return false;

            try
            {
                return BCrypt.Net.BCrypt.Verify(plainTextPin, hashedPin);
            }
            catch (Exception ex)
            {
                // Log the exception (implement logging as needed)
                Console.WriteLine($"PIN verification error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Checks if a PIN is in legacy (plaintext) format
        /// BCrypt hashes always start with "$2" followed by version info
        /// </summary>
        /// <param name="pin">The PIN to check</param>
        /// <returns>True if legacy (plaintext), false if hashed</returns>
        public bool IsLegacyPin(string pin)
        {
            if (string.IsNullOrWhiteSpace(pin))
                return false;

            // BCrypt hashes have a specific format: $2a$12$... or $2b$12$... etc.
            // If it doesn't start with $2, it's likely plaintext (legacy)
            return !pin.StartsWith("$2");
        }
    }
}