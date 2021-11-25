import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import { ServicePrincipal } from '@aws-cdk/aws-iam';
import { EndpointType } from '@aws-cdk/aws-apigateway';

export class InfrastructureStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // defines an AWS Lambda resource
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
    var newstr = mergedString.replace(re, getRecipesHandler.functionArn);
    var newApiDefinition = JSON.parse(newstr);

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
      }
    });

    // Todo: 
    // Route53 subdomain (api.openbrewhub.com) -> alias to apigateway
    // Certificate for subdomain
    // Custom Domain Name with api mapping
    
    //Example
    /*
    import * as cdk from "@aws-cdk/core";
    import * as apigw from "@aws-cdk/aws-apigateway";
    import * as acm from "@aws-cdk/aws-certificatemanager";
    import * as route53 from "@aws-cdk/aws-route53";
    import * as route53Targets from "@aws-cdk/aws-route53-targets";
    import * as lambda from "@aws-cdk/aws-lambda";

    export class HelloCdkStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        this.buildLambdaApiGateway();
      }

        buildLambdaApiGateway() {
        const rootDomain = "example.org";

        const zone = route53.HostedZone.fromLookup(this, "baseZone", {
          domainName: rootDomain,
        });

        const backend = new lambda.Function(this, "MyLayeredLambda", {
          code: new lambda.InlineCode("foo"),
          handler: "index.handler",
          runtime: lambda.Runtime.NODEJS_10_X,
        });

        const restApi = new apigw.LambdaRestApi(this, "myapi", {
          handler: backend,
          domainName: {
            domainName: `api-test.${rootDomain}`,
            certificate: acm.Certificate.fromCertificateArn(
              this,
              "my-cert",
              "arn:aws:acm:us-east-1:111112222333:certificate/abcd6805-1234-4159-ac38-761acdc700ef"
            ),
            endpointType: apigw.EndpointType.REGIONAL,
          },
        });

        new route53.ARecord(this, "apiDNS", {
          zone: zone,
          recordName: "api-test",
          target: route53.RecordTarget.fromAlias(
            new route53Targets.ApiGateway(restApi)
          ),
        });
      }
    }
    */
  }
}