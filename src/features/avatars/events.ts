// Dispatched on window after an avatar upload or removal succeeds, so client
// widgets that show the signed-in user's avatar (the header account link) can
// reload it without a full page load.
export const avatarChangedEvent = "jet-blog:avatar-changed";
