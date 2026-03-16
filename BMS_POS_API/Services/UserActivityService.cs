using BMS_POS_API.Data;
using BMS_POS_API.Models;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Services
{
    public interface IUserActivityService
    {
        Task LogActivityAsync(int? userId, string userName, string action, string? details = null,
            string? entityType = null, int? entityId = null, string? actionType = null, string? ipAddress = null);
        Task<(List<UserActivity> Items, int TotalCount)> GetActivitiesAsync(DateTime? startDate = null, DateTime? endDate = null,
            int? userId = null, string? actionType = null, int limit = 50, int offset = 0);
    }

    public class UserActivityService : IUserActivityService
    {
        private readonly IServiceProvider _serviceProvider;

        public UserActivityService(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public async Task LogActivityAsync(int? userId, string userName, string action, string? details = null, 
            string? entityType = null, int? entityId = null, string? actionType = null, string? ipAddress = null)
        {
            try
            {
                // Create a separate scope for activity logging to avoid threading conflicts
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
                
                var activity = new UserActivity
                {
                    UserId = userId,
                    UserName = userName,
                    Action = action,
                    Details = details,
                    EntityType = entityType,
                    EntityId = entityId,
                    ActionType = actionType,
                    IPAddress = ipAddress,
                    Timestamp = DateTime.UtcNow
                };

                context.UserActivities.Add(activity);
                await context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                // Log the error but don't throw - we don't want activity logging to break business operations
                Console.WriteLine($"Failed to log user activity: {ex.Message}");
            }
        }

        public async Task<(List<UserActivity> Items, int TotalCount)> GetActivitiesAsync(DateTime? startDate = null, DateTime? endDate = null,
            int? userId = null, string? actionType = null, int limit = 50, int offset = 0)
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();

            var query = context.UserActivities.Include(a => a.User).AsQueryable();

            if (startDate.HasValue)
                query = query.Where(a => a.Timestamp >= startDate.Value);

            if (endDate.HasValue)
                query = query.Where(a => a.Timestamp <= endDate.Value);

            if (userId.HasValue)
                query = query.Where(a => a.UserId == userId.Value);

            if (!string.IsNullOrEmpty(actionType))
                query = query.Where(a => a.ActionType == actionType);

            var ordered = query.OrderByDescending(a => a.Timestamp);

            var totalCount = await ordered.CountAsync();
            var items = await ordered.Skip(offset).Take(limit).ToListAsync();

            return (items, totalCount);
        }
    }
}