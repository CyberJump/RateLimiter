-- Sliding Window Log Rate Limiter
-- Uses a sorted set of request timestamps for precise sliding window tracking
--
-- KEYS[1] = ratelimit:sliding:{api_key_id}
-- ARGV[1] = limit
-- ARGV[2] = window_ms (window duration in milliseconds)
-- ARGV[3] = now_ms (current timestamp in milliseconds, from Redis TIME)
-- ARGV[4] = request_id (unique ID for this request, used as sorted set member)
--
-- Returns: {allowed (0/1), remaining, reset_ms, current_count}

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local request_id = ARGV[4]

-- Remove all entries older than the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- Count current entries in the window
local current = redis.call('ZCARD', key)
local allowed = 0

if current < limit then
  -- Add this request's timestamp as score, request_id as member
  redis.call('ZADD', key, now, request_id)
  current = current + 1
  allowed = 1
end

-- Set expiry on the key for cleanup (window duration)
redis.call('PEXPIRE', key, window)

local remaining = limit - current
if remaining < 0 then
  remaining = 0
end

-- Reset time = oldest entry timestamp + window duration
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset = now + window
if oldest and oldest[2] then
  reset = tonumber(oldest[2]) + window
end

return { allowed, remaining, reset, current }
