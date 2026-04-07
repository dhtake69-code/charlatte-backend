const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/transmettre-charlatte", async (req, res) => {
  try {
    const { metadata, destinataire, photos } = req.body || {};

    if (!metadata?.agent || !metadata?.charlatteId) {
      return res.status(400).json({
        error: "Le nom agent et l'ID charlatte sont obligatoires.",
      });
    }

    if (!Array.isArray(photos) || photos.length !== 8) {
      return res.status(400).json({
        error: "Il faut exactement 8 photos.",
      });
    }

    if (!process.env.BREVO_API_KEY) {
      return res.status(500).json({
        error: "BREVO_API_KEY manquante sur le serveur.",
      });
    }

    if (!process.env.MAIL_FROM) {
      return res.status(500).json({
        error: "MAIL_FROM manquant sur le serveur.",
      });
    }

    const toEmail = destinataire?.email || process.env.DEFAULT_TO_EMAIL;

    if (!toEmail) {
      return res.status(400).json({
        error: "Aucun email destinataire n'est configuré.",
      });
    }

    const attachments = photos
      .filter((p) => p && p.dataUrl)
      .map((p, index) => {
        const match = String(p.dataUrl).match(/^data:(.+);base64,(.+)$/);
        if (!match) return null;

        const mimeType = match[1];
        const base64 = match[2];

        const ext = mimeType.includes("png")
          ? "png"
          : mimeType.includes("webp")
          ? "webp"
          : "jpg";

        return {
          name: p.filename || `photo-${index + 1}.${ext}`,
          content: base64,
        };
      })
      .filter(Boolean);

    const htmlContent = `
      <h2>État des lieux Charlatte</h2>
      <p><strong>Agent :</strong> ${escapeHtml(metadata.agent)}</p>
      <p><strong>Charlatte :</strong> ${escapeHtml(metadata.charlatteId)}</p>
      <p><strong>Secteur :</strong> ${escapeHtml(metadata.secteur || "-")}</p>
      <p><strong>Commentaire :</strong> ${escapeHtml(metadata.commentaire || "-")}</p>
      <p><strong>Date d'envoi :</strong> ${new Date().toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
      })}</p>
      <p><strong>Nombre de photos :</strong> ${attachments.length}</p>
    `;

    const senderEmail = extractEmail(process.env.MAIL_FROM);
    const senderName = extractName(process.env.MAIL_FROM);

    const brevoPayload = {
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [
        {
          email: toEmail,
        },
      ],
      subject: `État des lieux Charlatte - ${metadata.charlatteId} - ${metadata.agent}`,
      htmlContent,
      attachment: attachments,
    };

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(brevoPayload),
    });

    const responseText = await brevoRes.text();
    let responseJson = null;

    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }

    if (!brevoRes.ok) {
      console.error("Brevo error:", brevoRes.status, responseText);
      return res.status(500).json({
        error:
          responseJson?.message ||
          responseJson?.code ||
          "Erreur Brevo pendant l'envoi du mail.",
      });
    }

    return res.json({
      ok: true,
      message: "Email envoyé avec succès.",
      brevo: responseJson || responseText,
    });
  } catch (error) {
    console.error("Erreur serveur:", error);
    return res.status(500).json({
      error: "Erreur serveur pendant l'envoi du mail.",
    });
  }
});

function extractEmail(mailFrom) {
  const match = String(mailFrom).match(/<([^>]+)>/);
  return match ? match[1].trim() : String(mailFrom).trim();
}

function extractName(mailFrom) {
  const match = String(mailFrom).match(/^(.*)<[^>]+>$/);
  return match ? match[1].trim().replace(/^"|"$/g, "") : "État des lieux Charlatte";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
