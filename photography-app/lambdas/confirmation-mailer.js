const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const ses = new SESClient()
const SENDER = process.env.SENDER_EMAIL
const FALLBACK = process.env.FALLBACK_EMAIL || SENDER

exports.handler = async (event) => {
  for (const rec of event.Records) {
    if (rec.eventName !== 'MODIFY') continue
    const oldS = rec.dynamodb?.OldImage?.status?.S
    const newS = rec.dynamodb?.NewImage?.status?.S
    if (!newS || oldS === newS) continue

    const id = rec.dynamodb?.Keys?.id?.S
    const reason = rec.dynamodb?.NewImage?.reason?.S || 'N/A'
    const maybeEmail = rec.dynamodb?.NewImage?.Name?.S
    const to = (maybeEmail && maybeEmail.includes('@')) ? maybeEmail : FALLBACK

    await ses.send(new SendEmailCommand({
      Source: SENDER,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `Image ${id} status: ${newS}` },
        Body: { Text: { Data: `Your image ${id} is now "${newS}". Reason: ${reason}` } }
      }
    }))
    console.log(`Sent mail to ${to} for ${id}`);
  }
};
