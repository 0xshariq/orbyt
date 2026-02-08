🌍 Orbyt Connect (Integration Hub)

Problem: Workflows need to talk to the world.

Build a connector library:

• Slack
• Email (SMTP)
• Webhooks
• Google Drive
• S3
• Telegram

Instead of users writing HTTP steps manually:

- uses: orbyt.connect.slack.send
  with:
  message: "Workflow done"

This makes Orbyt usable by non-dev automation users.

---
