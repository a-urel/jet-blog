// Data Cache tag for every anonymous public post read (listing, post page,
// slug redirects). Publication Server Actions expire it with updateTag so the
// next public request reads fresh rows instead of a cached PostgREST response.
export const publicPostsCacheTag = "public-posts";
