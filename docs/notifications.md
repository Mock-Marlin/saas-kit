# Notifications

`useNotifications` loads the cursor page, then opens a server-sent event stream. One tab holds a Web Lock named for the channel and fans items out with `BroadcastChannel`. Other tabs apply those messages.

The stream closes while the document is hidden. If `EventSource` errors, the inbox polls `pollMs` and tries the stream again.

`markSeen` updates the row before the response returns. `remove` drops it and puts it back when the delete fails.
