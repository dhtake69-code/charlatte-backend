const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || "true") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/transmettre-charlatte", async (req, res) => {
  try {
    const { metadata, destinataire, photos } = req.body || {};

    if (!metadata?.agent || !metadata?.charlatteId) {
      return res.status(400).json({ error: "Le nom agent et l'ID charlatte sont obligatoires." });
    }

    if (!Array.isArray(photos) || photos.length !== 8) {
      return res.status(400).json({ error: "Il faut exactement 8 photos." });
    }

    const attachments = photos
      .filter((p) => p && p.dataUrl)
      .map((p, index) => {
        const matches = String(p.dataUrl).match(/^data:(.+);base64,(.+)$/);
        if (!matches) return null;
        const mimeType = matches[1];
        const base64 = matches[2];
        const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

        return {
          filename: p.filename || `photo-${index + 1}.${ext}`,
          content: base64,
          encoding: "base64",
          contentType: mimeType
        };
      })
      .filter(Boolean);

    const to = destinataire?.email || process.env.DEFAULT_TO_EMAIL;
    if (!to) {
      return res.status(400).json({ error: "Aucun email destinataire n'est configuré." });
    }

    const html = `
      <h2>État des lieux Charlatte</h2>
      <p><strong>Agent :</strong> ${metadata.agent}</p>
      <p><strong>Charlatte :</strong> ${metadata.charlatteId}</p>
      <p><strong>Secteur :</strong> ${metadata.secteur || "-"}</p>
      <p><strong>Commentaire :</strong> ${metadata.commentaire || "-"}</p>
      <p><strong>Date d'envoi :</strong> ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
      <p><strong>Nombre de photos :</strong> ${attachments.length}</p>
    `;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: `État des lieux Charlatte - ${metadata.charlatteId} - ${metadata.agent}`,
      html,
      attachments
    });

    res.json({ ok: true, message: "Email envoyé au chef." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur serveur pendant l'envoi du mail." });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
