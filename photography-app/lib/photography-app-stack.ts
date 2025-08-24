import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEvent from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions'


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
      //Shorter for test purposes
      visibilityTimeout: cdk.Duration.seconds(10),
      deadLetterQueue: {queue: dlq, maxReceiveCount: 2},
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
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    })

    //SNS Topic
    const topic = new sns.Topic(this, 'ImageEventTopic', {
      displayName: 'Photos Topic'
    })

    const env = {
      BUCKET_NAME: bucket.bucketName,
      UPLOAD_QUEUE: ulq.queueUrl,
      DELETE_QUEUE: dlq.queueUrl,
      TABLE_NAME: table.tableName,
      TOPIC: topic.topicArn,
      SENDER_EMAIL: 'ljdoocey@gmail.com',
      FALLBACK_EMAIL: 'ljdoocey2@gmail.com'
    }

    // Lambda Functions

    //Log Image
    const logImageFn = new lambda.Function(this, 'LogImageFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'log-image.handler',
      code: lambda.Code.fromAsset('lambdas'),
      environment: env,
      timeout: cdk.Duration.seconds(10),
    })
    logImageFn.addEventSource(new lambdaEvent.SqsEventSource(ulq, {batchSize: 5}))

    //Log Image Permissions
    bucket.grantRead(logImageFn)
    table.grantWriteData(logImageFn)

    //Remove Image
    const removeImageFn = new lambda.Function(this, 'RemoveImageFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'remove-image.handler',
      code: lambda.Code.fromAsset('lambdas'),
      environment: env,
      timeout: cdk.Duration.seconds(10),
    })
    removeImageFn.addEventSource(new lambdaEvent.SqsEventSource(dlq, {batchSize: 5}))

    //Remove Image Permissions
    bucket.grantDelete(removeImageFn)


    //Add Metadata
    const addMetadataFn = new lambda.Function(this, 'AddMetadataFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'add-metadata.handler',
      code: lambda.Code.fromAsset('lambdas'),
      environment: env,
      timeout: cdk.Duration.seconds(10),
    })

    //Add Metadata Permissions
    table.grantReadWriteData(addMetadataFn)

    //Update Status
    const updateStatusFn = new lambda.Function(this, 'UpdateStatusFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'update-status.handler',
      code: lambda.Code.fromAsset('lambdas'),
      environment: env,
      timeout: cdk.Duration.seconds(10),
    })

    //Update Status Permissions
    table.grantReadWriteData(updateStatusFn)


    topic.addSubscription(new subs.LambdaSubscription(addMetadataFn, {
      filterPolicy: {
        metadata_type: sns.SubscriptionFilter.stringFilter({
          allowlist: ['Caption', 'Date', 'Name', 'name']
        })
      }
    }))

    new sns.CfnSubscription(this, 'UpdateStatusRawSub', {
      protocol: 'lambda',
      topicArn: topic.topicArn,
      endpoint: updateStatusFn.functionArn,
      filterPolicy: { 
        metadata_type: [
          { exists: false },
          { 'anything-but': ['Caption', 'Date', 'Name', 'name'] }
        ]
      },
      filterPolicyScope: 'MessageAttributes'
    })

    new lambda.CfnPermission(this, 'AllowSnsInvokeUpdate', {
      action: 'lambda:InvokeFunction',
      functionName: updateStatusFn.functionArn,
      principal: 'sns.amazonaws.com',
      sourceArn: topic.topicArn,
    });


    //Confirmation Mailer
    const confirmationMailerFn = new lambda.Function(this, 'ConfirmationMailerFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'confirmation-mailer.handler',
      code: lambda.Code.fromAsset('lambdas'),
      environment: env,
      timeout: cdk.Duration.seconds(20),
    })
    confirmationMailerFn.addEventSource(new lambdaEvent.DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 5,
      retryAttempts: 3
    }))

    //SES for Mailer
    confirmationMailerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }))
  }
}
