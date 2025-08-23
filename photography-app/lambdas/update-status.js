
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb')
const ddb = new DynamoDBClient()
const TABLE = process.env.TABLE_NAME

exports.handler = async (event) => {
  for (const rec of event.Records) {
    const msg = JSON.parse(rec.Sns.Message || '{}')
    const { id, date, update } = msg || {}

    if (!id || !update?.status || !update?.reason) continue
    if (!['Pass','Reject'].includes(update.status)) continue

    await ddb.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { id: { S: id } },
      UpdateExpression: 'SET #s = :s, #r = :r, #d = :d',
      ExpressionAttributeNames: { '#s':'status', '#r':'reason', '#d':'statusUpdatedAt' },
      ExpressionAttributeValues: {
        ':s': { S: update.status }, ':r': { S: update.reason }, ':d': { S: date || '' }
      }
    }))
    console.log(`Updated status for ${id} -> ${update.status}`)
  }
}
