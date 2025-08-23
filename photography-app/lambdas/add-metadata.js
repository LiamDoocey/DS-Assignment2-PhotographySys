const {DynamoDBClient, UpdateItemCommand} = require('@aws-sdk/client-dynamodb')
const ddb = new DynamoDBClient()
const TABLE = process.env.TABLE_NAME

exports.handler = async (event) => {
    for (const rec of event.Records) {
        const msg = JSON.parse(rec.Sns.Message)
        const attrs = rec.Sns.MessageAttributes || {}
        const metaType = attrs.metadata_type?.Value

        if(!msg.id || msg.value == null || !metaType) continue

        const attrName = metaType === 'name' ? 'Name' : metaType

        await ddb.send(new UpdateItemCommand({
            TableName: TABLE,
            Key: {id: {S: msg.id}},
            UpdateExpression: 'SET #k = :v',
            ExpressionAttributeNames: {'#k': attrName},
            ExpressionAttributeValues: { ':v' : {S: String(msg.value)}}
        }))
        console.log(`Set ${attrName} on ${msg.id}`)
    }
}