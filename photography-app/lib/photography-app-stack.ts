import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as sns from 'aws-cdk-lib/aws-sns'


export class PhotographyAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // s3 Bucket
    const bucket = new s3.Bucket(this, 'PhotoBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: false,
    })

    // SQS Queues
    const dlq = new sqs.Queue(this, 'invalidPhotoDLQ', {
      retentionPeriod: cdk.Duration.days(7),
      visibilityTimeout: cdk.Duration.seconds(30)
    })

    const ulq = new sqs.Queue(this, 'uploadQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: {queue: dlq, maxReceiveCount: 3},
    })

    //S3 -> ulq
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.SqsDestination(ulq)
    )

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_COMPLETE_MULTIPART_UPLOAD,
      new s3n.SqsDestination(ulq)
    )

    // Dynamo Table for photos
    const table = new dynamodb.Table(this, 'PhotoTable', {
      partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    //SNS Topic
    const topic = new sns.Topic(this, 'ImageEventTopic', {
      displayName: 'Photos Topic'
    })

    //TESTING OUTPUTS
    new cdk.CfnOutput(this, 'BucketName', {value: bucket.bucketName})
    new cdk.CfnOutput(this, 'Upload Q URL', {value: ulq.queueUrl})
    new cdk.CfnOutput(this, 'Delete Q URL', {value: dlq.queueUrl})
    new cdk.CfnOutput(this, 'Table Name', {value: table.tableName})
    new cdk.CfnOutput(this, 'Topic ARN', {value: topic.topicArn})
  }
}
