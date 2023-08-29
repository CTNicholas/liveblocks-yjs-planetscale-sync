import { WebhookHandler } from "@liveblocks/node";
import { sql } from "@vercel/postgres";

/**
 * An example of a webhook endpoint that listens for Yjs changes
 * You can use this setup to sync Yjs document data to your database
 * https://liveblocks.io/docs/platform/webhooks
 *
 * Find your API keys on the Liveblocks dashboard
 * https://liveblocks.io/dashboard
 */

// "Signing secret" found in a project's webhooks page
const WEBHOOK_SECRET = "whsec_LQdX6oaQx/9sPhO9p99dR1uTSAcaZ/Sp";
const webhookHandler = new WebhookHandler(WEBHOOK_SECRET);

// "Secret key" found in a project's API keys page
const API_SECRET = process.env.LIVEBLOCKS_SECRET_KEY as string;

export async function POST(request: Request) {
  const body = await request.json();

  let event;
  try {
    event = webhookHandler.verifyRequest({
      headers: request.headers,
      rawBody: JSON.stringify(body),
    });
  } catch (err) {
    console.error(err);
    return new Response("Could not verify webhook call", { status: 400 });
  }

  // If Yjs Storage data has updated
  // https://liveblocks.io/docs/platform/webhooks#YDocUpdatedEvent
  if (event.type === "ydocUpdated") {
    const { roomId } = event.data;

    // Fetch Yjs Storage data from the Liveblocks REST API
    // https://liveblocks.io/docs/api-reference/rest-api-endpoints#get-rooms-roomId-ydoc
    const url = `https://api.liveblocks.io/v2/rooms/${roomId}/ydoc`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${API_SECRET}` },
    });

    if (!response.ok) {
      return new Response("Problem accessing Liveblocks REST APIs", {
        status: 500,
      });
    }

    // The Yjs document data
    const yjsDocData = await response.text();

    // Update your database with the Yjs data
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS documents (
          roomId VARCHAR(255) PRIMARY KEY,
          yjsDoc TEXT NOT NULL
        );
      `;
      await sql`
        INSERT INTO documents (roomId, yjsDoc)
        VALUES (${roomId}, ${yjsDocData})
        ON CONFLICT (roomId)
        DO UPDATE SET
          yjsDoc = EXCLUDED.yjsDoc
      `;
    } catch (err) {
      console.log(err);
      return new Response("Problem inserting data into database", {
        status: 500,
      });
    }
  }

  return new Response(null, { status: 200 });
}
