using Microsoft.AspNetCore.Mvc;
using BMS_POS_API.Services;
using BMS_POS_API.Models;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserActivityController : ControllerBase
    {
        private readonly IUserActivityService _userActivityService;

        public UserActivityController(IUserActivityService userActivityService)
        {
            _userActivityService = userActivityService;
        }

        // GET: api/useractivity
        [HttpGet]
        public async Task<ActionResult<UserActivityResponse>> GetUserActivities(
            [FromQuery] DateTime? startDate = null,
            [FromQuery] DateTime? endDate = null,
            [FromQuery] int? userId = null,
            [FromQuery] string? actionType = null,
            [FromQuery] int limit = 1000)
        {
            try
            {
                var activities = await _userActivityService.GetActivitiesAsync(
                    startDate, endDate, userId, actionType, limit);

                var response = new UserActivityResponse
                {
                    Activities = activities.Select(a => new UserActivityDto
                    {
                        Id = a.Id,
                        UserId = a.UserId,
                        UserName = a.UserName,
                        Action = a.Action,
                        Details = a.Details,
                        EntityType = a.EntityType,
                        EntityId = a.EntityId,
                        ActionType = a.ActionType,
                        IPAddress = a.IPAddress,
                        // Return UTC timestamp with proper UTC kind for JSON serialization
                        Timestamp = DateTime.SpecifyKind(a.Timestamp, DateTimeKind.Utc)
                    }).ToList(),
                    TotalCount = activities.Count
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                return BadRequest($"Failed to retrieve user activities: {ex.Message}");
            }
        }

        // GET: api/useractivity/summary
        [HttpGet("summary")]
        public async Task<ActionResult<UserActivitySummaryResponse>> GetActivitySummary(
            [FromQuery] DateTime? startDate = null,
            [FromQuery] DateTime? endDate = null)
        {
            try
            {
                var activities = await _userActivityService.GetActivitiesAsync(startDate, endDate);

                var summary = new UserActivitySummaryResponse
                {
                    TotalActivities = activities.Count,
                    UniqueUsers = activities.Where(a => a.UserId.HasValue).Select(a => a.UserId).Distinct().Count(),
                    ActivityTypes = activities
                        .GroupBy(a => a.ActionType ?? "Unknown")
                        .Select(g => new ActivityTypeSummary
                        {
                            ActionType = g.Key,
                            Count = g.Count()
                        })
                        .OrderByDescending(a => a.Count)
                        .ToList(),
                    TopUsers = activities
                        .Where(a => a.UserId.HasValue)
                        .GroupBy(a => new { a.UserId, a.UserName })
                        .Select(g => new UserActivityCount
                        {
                            UserId = g.Key.UserId,
                            UserName = g.Key.UserName,
                            ActivityCount = g.Count()
                        })
                        .OrderByDescending(u => u.ActivityCount)
                        .Take(10)
                        .ToList()
                };

                return Ok(summary);
            }
            catch (Exception ex)
            {
                return BadRequest($"Failed to retrieve activity summary: {ex.Message}");
            }
        }
    }

    // Response DTOs
    public class UserActivityResponse
    {
        public List<UserActivityDto> Activities { get; set; } = new List<UserActivityDto>();
        public int TotalCount { get; set; }
    }

    public class UserActivityDto
    {
        public int Id { get; set; }
        public int? UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string? Details { get; set; }
        public string? EntityType { get; set; }
        public int? EntityId { get; set; }
        public string? ActionType { get; set; }
        public string? IPAddress { get; set; }
        public DateTime Timestamp { get; set; }
    }

    public class UserActivitySummaryResponse
    {
        public int TotalActivities { get; set; }
        public int UniqueUsers { get; set; }
        public List<ActivityTypeSummary> ActivityTypes { get; set; } = new List<ActivityTypeSummary>();
        public List<UserActivityCount> TopUsers { get; set; } = new List<UserActivityCount>();
    }

    public class ActivityTypeSummary
    {
        public string ActionType { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public class UserActivityCount
    {
        public int? UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int ActivityCount { get; set; }
    }
}