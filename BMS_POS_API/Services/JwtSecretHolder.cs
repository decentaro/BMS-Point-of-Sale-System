using System.Security.Cryptography;

namespace BMS_POS_API.Services
{
    /// <summary>
    /// Loads or generates the JWT signing secret and persists it to
    /// {ApplicationData}/BMS_POS/bms-jwt.secret so active sessions survive
    /// process restarts (e.g. after a crash or OS update).
    ///
    /// The file is written with owner-read-write-only permissions on Linux/macOS.
    /// If the file system is unavailable the service falls back to an ephemeral
    /// in-process secret (same as the old behaviour).
    /// </summary>
    public class JwtSecretHolder
    {
        private const string SecretFileName = "bms-jwt.secret";
        private const int MinSecretLength = 64;

        public string Secret { get; }

        public JwtSecretHolder()
        {
            Secret = LoadOrCreate();
        }

        private static string LoadOrCreate()
        {
            try
            {
                var dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "BMS_POS");

                Directory.CreateDirectory(dir);
                var path = Path.Combine(dir, SecretFileName);

                if (File.Exists(path))
                {
                    var stored = File.ReadAllText(path).Trim();
                    if (stored.Length >= MinSecretLength)
                        return stored;
                }

                // Generate and persist a new secret
                var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
                File.WriteAllText(path, secret);

                // Restrict to owner-only on Linux/macOS
                if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
                {
                    try
                    {
                        File.SetUnixFileMode(
                            path,
                            UnixFileMode.UserRead | UnixFileMode.UserWrite);
                    }
                    catch { /* Filesystem does not support Unix permissions — ignore */ }
                }

                return secret;
            }
            catch
            {
                // Fallback: ephemeral secret (tokens invalidated on restart)
                return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
            }
        }
    }
}
