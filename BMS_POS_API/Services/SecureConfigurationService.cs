using System.Text.RegularExpressions;

namespace BMS_POS_API.Services
{
    public interface ISecureConfigurationService
    {
        string ProcessConnectionString(string connectionString);
        void EnsureEnvironmentVariables();
    }

    public class SecureConfigurationService : ISecureConfigurationService
    {
        private readonly Dictionary<string, string> _environmentMappings = new Dictionary<string, string>
        {
            { "{{DB_USER}}", "BMS_DB_USER" },
            { "{{DB_PASSWORD}}", "BMS_DB_PASSWORD" },
            { "{{DB_SERVER}}", "BMS_DB_SERVER" },
            { "{{DB_PORT}}", "BMS_DB_PORT" },
            { "{{DB_NAME}}", "BMS_DB_NAME" }
        };

        /// <summary>
        /// Processes connection string by replacing placeholders with environment variables.
        /// </summary>
        public string ProcessConnectionString(string connectionString)
        {
            if (string.IsNullOrEmpty(connectionString))
                return connectionString;

            var processed = connectionString;

            foreach (var mapping in _environmentMappings)
            {
                var placeholder = mapping.Key;
                var envVarName = mapping.Value;
                var envValue = Environment.GetEnvironmentVariable(envVarName);

                if (!string.IsNullOrEmpty(envValue))
                {
                    processed = processed.Replace(placeholder, envValue);
                }
                else if (processed.Contains(placeholder))
                {
                    Console.WriteLine($"Warning: Environment variable '{envVarName}' not found. Using placeholder value.");
                }
            }

            return processed;
        }

        /// <summary>
        /// Ensures all required environment variables are set.
        /// Logs a warning for any that are missing — no hardcoded defaults.
        /// </summary>
        public void EnsureEnvironmentVariables()
        {
            var required = new[] { "BMS_DB_USER", "BMS_DB_PASSWORD", "BMS_DB_SERVER", "BMS_DB_PORT", "BMS_DB_NAME" };
            var optional = new Dictionary<string, string>
            {
                { "BMS_DB_PORT", "5432" },
                { "BMS_DB_NAME", "postgres" }
            };

            foreach (var key in required)
            {
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                {
                    if (optional.TryGetValue(key, out var defaultValue))
                    {
                        Environment.SetEnvironmentVariable(key, defaultValue);
                        Console.WriteLine($"Using default for {key}: {defaultValue}");
                    }
                    else
                    {
                        Console.WriteLine($"SECURITY WARNING: Required environment variable '{key}' is not set!");
                        Console.WriteLine($"  Linux/Mac: export {key}=your_value");
                        Console.WriteLine($"  Windows:   set {key}=your_value");
                    }
                }
            }
        }
    }
}