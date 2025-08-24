const {S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const s3 = new S3Client()
const BUCKET = process.env.BUCKET_NAME

exports.handler = async (event) => {
    for (const r of event.Records) {
        const body = JSON.parse(r.body);
        const s3Event = body.Records ? body : JSON.parse(body.Message || '{}')
         
        for (const rec of s3Event.Records || []) {
            const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, ' '))
            await s3.send(new DeleteObjectCommand({
                Bucket: BUCKET, 
                Key: key
            }))
            console.log(`Removed invalid object: ${key}`)
        }
    }
}