import { google } from "googleapis";
import { Type } from "@earendil-works/pi-ai";
import { createAuthClient } from "./google-auth.js";

function getAuth() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google Workspace non configurato. Esegui: node setup-google-auth.js");
  }
  return createAuthClient();
}

function extractEmailBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64").toString("utf-8");
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const nested = extractEmailBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

function headerValue(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

export const gmailSearchTool = {
  name: "gmail_search",
  label: "Gmail: Search Emails",
  description: "Searches Gmail emails. Use Gmail search syntax (e.g. 'from:someone@example.com', 'subject:meeting', 'is:unread', 'after:2024/01/01'). Returns a list of matching emails with sender, subject, date, and snippet.",
  parameters: Type.Object({
    query: Type.String({ description: "Gmail search query, e.g. 'is:unread from:boss@company.com'" }),
    max_results: Type.Optional(Type.Number({ description: "Max emails to return (default 10)" })),
  }),
  execute: async (_id, { query, max_results = 10 }) => {
    const gmail = google.gmail({ version: "v1", auth: getAuth() });
    const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: max_results });
    const messages = list.data.messages ?? [];
    if (messages.length === 0) {
      return { content: [{ type: "text", text: "Nessuna email trovata." }], details: { query } };
    }

    const details = await Promise.all(
      messages.map(m => gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] }))
    );

    const text = details.map((d, i) => {
      const h = d.data.payload.headers;
      return `${i + 1}. **${headerValue(h, "Subject") || "(no subject)"}**\n   Da: ${headerValue(h, "From")}\n   Data: ${headerValue(h, "Date")}\n   ID: ${d.data.id}\n   ${d.data.snippet}`;
    }).join("\n\n");

    return { content: [{ type: "text", text }], details: { query, count: messages.length } };
  },
};

export const gmailReadTool = {
  name: "gmail_read",
  label: "Gmail: Read Email",
  description: "Reads the full content of a Gmail email given its ID. Use gmail_search first to find the ID.",
  parameters: Type.Object({
    message_id: Type.String({ description: "The Gmail message ID obtained from gmail_search" }),
  }),
  execute: async (_id, { message_id }) => {
    const gmail = google.gmail({ version: "v1", auth: getAuth() });
    const msg = await gmail.users.messages.get({ userId: "me", id: message_id, format: "full" });
    const h = msg.data.payload.headers;
    const body = extractEmailBody(msg.data.payload).slice(0, 6000);
    const text = `**Da:** ${headerValue(h, "From")}\n**A:** ${headerValue(h, "To")}\n**Oggetto:** ${headerValue(h, "Subject")}\n**Data:** ${headerValue(h, "Date")}\n\n---\n\n${body}`;
    return { content: [{ type: "text", text }], details: { message_id } };
  },
};

export const gmailSendTool = {
  name: "gmail_send",
  label: "Gmail: Send Email",
  description: "Sends an email via Gmail. Always confirm with the user before sending.",
  parameters: Type.Object({
    to: Type.String({ description: "Recipient email address" }),
    subject: Type.String({ description: "Email subject" }),
    body: Type.String({ description: "Plain text email body" }),
    cc: Type.Optional(Type.String({ description: "CC email addresses, comma-separated" })),
  }),
  execute: async (_id, { to, subject, body, cc }) => {
    const gmail = google.gmail({ version: "v1", auth: getAuth() });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const from = profile.data.emailAddress;

    let raw = `From: ${from}\nTo: ${to}\n`;
    if (cc) raw += `Cc: ${cc}\n`;
    raw += `Subject: ${subject}\nContent-Type: text/plain; charset=utf-8\n\n${body}`;

    const encoded = Buffer.from(raw).toString("base64url");
    const sent = await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

    return {
      content: [{ type: "text", text: `Email inviata a ${to} (ID: ${sent.data.id})` }],
      details: { to, subject, message_id: sent.data.id },
    };
  },
};

// ─── Calendar ─────────────────────────────────────────────────────────────────

export const calendarListEventsTool = {
  name: "calendar_list_events",
  label: "Calendar: List Events",
  description: "Lists upcoming Google Calendar events. Returns title, date/time, location, and description of each event.",
  parameters: Type.Object({
    days_ahead: Type.Optional(Type.Number({ description: "How many days ahead to look (default 7)" })),
    max_results: Type.Optional(Type.Number({ description: "Max events to return (default 10)" })),
  }),
  execute: async (_id, { days_ahead = 7, max_results = 10 }) => {
    const calendar = google.calendar({ version: "v3", auth: getAuth() });
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + days_ahead * 86400000).toISOString();

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: max_results,
    });

    const events = res.data.items ?? [];
    if (events.length === 0) {
      return { content: [{ type: "text", text: `Nessun evento nei prossimi ${days_ahead} giorni.` }], details: {} };
    }

    const text = events.map((e, i) => {
      const start = e.start?.dateTime ?? e.start?.date ?? "?";
      const end = e.end?.dateTime ?? e.end?.date ?? "?";
      return `${i + 1}. **${e.summary ?? "(senza titolo)"}**\n   Inizio: ${start}\n   Fine: ${end}${e.location ? `\n   Luogo: ${e.location}` : ""}${e.description ? `\n   ${e.description.slice(0, 200)}` : ""}`;
    }).join("\n\n");

    return { content: [{ type: "text", text }], details: { count: events.length, days_ahead } };
  },
};

export const calendarCreateEventTool = {
  name: "calendar_create_event",
  label: "Calendar: Create Event",
  description: "Creates a new event in Google Calendar. Dates must be in ISO 8601 format with timezone, e.g. '2025-06-15T10:00:00+02:00'. Always confirm with the user before creating.",
  parameters: Type.Object({
    title: Type.String({ description: "Event title" }),
    start: Type.String({ description: "Start datetime in ISO 8601 format, e.g. 2025-06-15T10:00:00+02:00" }),
    end: Type.String({ description: "End datetime in ISO 8601 format, e.g. 2025-06-15T11:00:00+02:00" }),
    description: Type.Optional(Type.String({ description: "Event description or notes" })),
    location: Type.Optional(Type.String({ description: "Event location" })),
  }),
  execute: async (_id, { title, start, end, description, location }) => {
    const calendar = google.calendar({ version: "v3", auth: getAuth() });
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        location,
        start: { dateTime: start },
        end: { dateTime: end },
      },
    });
    return {
      content: [{ type: "text", text: `Evento "${title}" creato. [Apri in Calendar](${event.data.htmlLink})` }],
      details: { event_id: event.data.id, link: event.data.htmlLink },
    };
  },
};

// ─── Drive ────────────────────────────────────────────────────────────────────

export const driveListFilesTool = {
  name: "drive_list_files",
  label: "Drive: List Files",
  description: "Lists files in Google Drive. Supports Drive search syntax (e.g. 'name contains \"report\"', 'mimeType=\"application/pdf\"', 'trashed=false'). Returns file name, type, and link.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Drive search query. Default: recent files." })),
    max_results: Type.Optional(Type.Number({ description: "Max files to return (default 10)" })),
  }),
  execute: async (_id, { query = "trashed=false", max_results = 10 }) => {
    const drive = google.drive({ version: "v3", auth: getAuth() });
    const res = await drive.files.list({
      q: query,
      pageSize: max_results,
      orderBy: "modifiedTime desc",
      fields: "files(id, name, mimeType, webViewLink, modifiedTime)",
    });

    const files = res.data.files ?? [];
    if (files.length === 0) {
      return { content: [{ type: "text", text: "Nessun file trovato." }], details: { query } };
    }

    const text = files.map((f, i) => {
      const type = f.mimeType.split(".").pop().split("/").pop();
      return `${i + 1}. **[${f.name}](${f.webViewLink})** (${type})\n   ID: ${f.id} — Modificato: ${f.modifiedTime?.slice(0, 10)}`;
    }).join("\n\n");

    return { content: [{ type: "text", text }], details: { query, count: files.length } };
  },
};

export const driveReadFileTool = {
  name: "drive_read_file",
  label: "Drive: Read File",
  description: "Reads the text content of a Google Drive file. Works with Google Docs, Sheets (as CSV), and plain text files. Use drive_list_files to get the file ID.",
  parameters: Type.Object({
    file_id: Type.String({ description: "The Drive file ID obtained from drive_list_files" }),
  }),
  execute: async (_id, { file_id }) => {
    const drive = google.drive({ version: "v3", auth: getAuth() });
    const meta = await drive.files.get({ fileId: file_id, fields: "name,mimeType" });
    const { name, mimeType } = meta.data;

    let content;
    if (mimeType === "application/vnd.google-apps.document") {
      const res = await drive.files.export({ fileId: file_id, mimeType: "text/plain" }, { responseType: "text" });
      content = res.data;
    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      const res = await drive.files.export({ fileId: file_id, mimeType: "text/csv" }, { responseType: "text" });
      content = res.data;
    } else {
      const res = await drive.files.get({ fileId: file_id, alt: "media" }, { responseType: "text" });
      content = res.data;
    }

    const text = `**${name}**\n\n${String(content).slice(0, 8000)}`;
    return { content: [{ type: "text", text }], details: { file_id, name, mimeType } };
  },
};

export const googleTools = [
  gmailSearchTool,
  gmailReadTool,
  gmailSendTool,
  calendarListEventsTool,
  calendarCreateEventTool,
  driveListFilesTool,
  driveReadFileTool,
];
