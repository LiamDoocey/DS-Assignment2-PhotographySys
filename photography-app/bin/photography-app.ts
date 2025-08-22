#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PhotographyAppStack } from '../lib/photography-app-stack';

const app = new cdk.App();
new PhotographyAppStack(app, 'PhotographyAppStack', {
  env: {region: "eu-west-1"}
});