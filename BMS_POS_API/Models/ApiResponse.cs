namespace BMS_POS_API.Models
{
    /// <summary>
    /// Standardized API response model for better error handling
    /// </summary>
    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public T? Data { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? ErrorCode { get; set; }
        public List<string>? ValidationErrors { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        public static ApiResponse<T> SuccessResponse(T data, string message = "Success")
        {
            return new ApiResponse<T>
            {
                Success = true,
                Data = data,
                Message = message
            };
        }

        public static ApiResponse<T> ErrorResponse(string message, string? errorCode = null, List<string>? validationErrors = null)
        {
            return new ApiResponse<T>
            {
                Success = false,
                Message = message,
                ErrorCode = errorCode,
                ValidationErrors = validationErrors
            };
        }
    }

    /// <summary>
    /// Authentication specific error codes
    /// </summary>
    public static class AuthErrorCodes
    {
        public const string EMPLOYEE_NOT_FOUND = "AUTH_001";
        public const string INVALID_PIN = "AUTH_002"; 
        public const string ACCOUNT_INACTIVE = "AUTH_003";
        public const string ROLE_MISMATCH = "AUTH_004";
        public const string INVALID_INPUT = "AUTH_005";
        public const string DATABASE_ERROR = "AUTH_006";
        public const string NETWORK_ERROR = "AUTH_007";
        public const string ACCOUNT_LOCKED = "AUTH_008";
        public const string PIN_EXPIRED = "AUTH_009";
    }

    /// <summary>
    /// User-friendly error messages
    /// </summary>
    public static class AuthErrorMessages
    {
        public const string EMPLOYEE_NOT_FOUND = "Employee ID not found. Please check your employee ID and try again.";
        public const string INVALID_PIN = "Incorrect PIN. Please check your PIN and try again.";
        public const string ACCOUNT_INACTIVE = "Your account has been deactivated. Please contact your manager.";
        public const string ROLE_MISMATCH = "You selected the wrong role. Please choose your correct role and try again.";
        public const string INVALID_INPUT = "Please fill in all required fields.";
        public const string DATABASE_ERROR = "System temporarily unavailable. Please try again in a few moments.";
        public const string NETWORK_ERROR = "Connection error. Please check your internet connection and try again.";
        public const string ACCOUNT_LOCKED = "Account temporarily locked due to multiple failed attempts. Please try again later or contact your manager.";
        public const string PIN_EXPIRED = "Your PIN has expired. Please contact your manager to reset it.";
    }
}