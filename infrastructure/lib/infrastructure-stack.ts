import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import { ServicePrincipal } from '@aws-cdk/aws-iam';
import { EndpointType } from '@aws-cdk/aws-apigateway';
import * as route53 from "@aws-cdk/aws-route53";
import * as route53Targets from "@aws-cdk/aws-route53-targets";
import * as acm from "@aws-cdk/aws-certificatemanager";

export class InfrastructureStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get hosted zone
    const rootDomain = "openbrewhub.com";
    const zone = route53.HostedZone.fromLookup(this, "baseZone", {
      domainName: rootDomain,
    });

    // Create certificate
    const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: `api.${rootDomain}`,
      validation: acm.CertificateValidation.fromDns(zone)
    });

    // Lambda function for api gateway integration
    const getRecipesHandler = new lambda.Function(this, 'openbrew_getRecipesHandler', {
      functionName: 'OpenBrew-GetRecipients',
      runtime: lambda.Runtime.PYTHON_3_6,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'getrecipes.lambda_handler'
    });

    // Grant lambda access for api gateway(s)
    getRecipesHandler.grantInvoke(new ServicePrincipal('apigateway.amazonaws.com')); //maybe more granular in future...

    // Merge api-definition with aws specifics
    var mergeYaml = require('merge-yaml');
    var merged = mergeYaml([
      './assets/aws-parts.yaml',
      './assets/openbrew-api.yaml'
    ]);
    var mergedString = JSON.stringify(merged);

    // Inject lambda arns 
    var re = /FreakyLambdaArn/g;
    var preparedString = mergedString.replace(re, getRecipesHandler.functionArn);
    var newApiDefinition = JSON.parse(preparedString);

    // Define API from merged open api spec
    const api = new apigateway.SpecRestApi(this, 'Open Brew Recipes API', {
      apiDefinition: apigateway.ApiDefinition.fromInline(newApiDefinition),
      endpointTypes: [EndpointType.REGIONAL],
      deployOptions: {
        description: 'This is the common standard api description for the exchange of beer brewing recipes. Cheers.',
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        metricsEnabled: true,
        dataTraceEnabled: true,
      },
      domainName: {
        domainName: `api.${rootDomain}`,
        certificate: apiCertificate
      }
    });

    // Map api gateways custom domain name to a record
    new route53.ARecord(this, "apiDNS", {
      zone: zone,
      recordName: "api",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGateway(api)
      ),
    });

  }
}