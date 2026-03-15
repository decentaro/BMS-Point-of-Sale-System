namespace BMS_POS_API.Services
{
    /// <summary>
    /// Singleton that generates a random JWT signing secret on startup.
    /// The secret is ephemeral — it lives only for the lifetime of the process,
    /// which is fine for a desktop POS app (all tokens become invalid on restart).
    /// </summary>
    public class JwtSecretHolder
    {
        public string Secret { get; } =
            Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(64));
    }
}
