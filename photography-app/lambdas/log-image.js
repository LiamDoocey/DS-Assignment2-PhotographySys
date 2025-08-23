const {DynamoDBClient, PutItemCommand} = require('@aws-sdk/client-dynamodb');
const ddb = new DynamoDBClient();
const TABLE = process.env.TABLE_NAME

const ok = new Set(['.jpg', '.jpeg', '.png'])

exports.handler = async (event) => {
    for (const r of event.Records) {
        const body = JSON.parse(r.body);
        const s3Event = body.Records ? body : JSON.parse(body.Message || "{}")

        for (const rec of s3Event.Records || []){
            const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, ' '))
            const ext = (key.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
            
            if (!ok.has(ext)) {
                console.log(`Rejecting ${key} (ext=${ext})`)
                throw new Error(`Invalid file type: ${key}`)
            }
            await ddb.send(new PutItemCommand({
                TableName: TABLE,
                Item: {id: { S: key}},
                ConditionExpression: 'attribute_not_exists(id)'
            })).catch(e => {
                if (e.name !== 'ConditionalCheckFailedException') throw e;
            })
            console.log(`Logged ${key}`)
        }
    }
};