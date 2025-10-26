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
        /// Processes connection string by replacing placeholders with environment variables
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
                    // Only warn if connection string actually contains placeholders
                    Console.WriteLine($"Warning: Environment variable '{envVarName}' not found. Using placeholder value.");
                }
            }

            return processed;
        }

        /// <summary>
        /// Ensures all required environment variables are set with default values if not present
        /// This is for desktop deployment - sets secure defaults
        /// </summary>
        public void EnsureEnvironmentVariables()
        {
            var requiredEnvVars = new Dictionary<string, string>
            {
                { "BMS_DB_USER", "postgres.saaudpmfwnbphgveugzx" },
                { "BMS_DB_PASSWORD", "" }, // Will be set separately for security
                { "BMS_DB_SERVER", "aws-1-ap-southeast-1.pooler.supabase.com" },
                { "BMS_DB_PORT", "5432" },
                { "BMS_DB_NAME", "postgres" }
            };

            foreach (var envVar in requiredEnvVars)
            {
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(envVar.Key)))
                {
                    if (envVar.Key == "BMS_DB_PASSWORD")
                    {
                        // For desktop deployment, you'll need to set this
                        Console.WriteLine($"SECURITY WARNING: Environment variable '{envVar.Key}' is not set!");
                        Console.WriteLine("Please set the database password using: ");
                        Console.WriteLine($"  Windows: set {envVar.Key}=your_password");
                        Console.WriteLine($"  Linux/Mac: export {envVar.Key}=your_password");
                    }
                    else
                    {
                        Environment.SetEnvironmentVariable(envVar.Key, envVar.Value);
                        Console.WriteLine($"Set default environment variable: {envVar.Key}");
                    }
                }
            }
        }
    }
}