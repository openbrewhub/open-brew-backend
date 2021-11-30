import * as cdk from '@aws-cdk/core';
import { UserPool, VerificationEmailStyle, AccountRecovery } from "@aws-cdk/aws-cognito";
import * as dynamodb from '@aws-cdk/aws-dynamodb'
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import { ServicePrincipal, Role, PolicyStatement } from '@aws-cdk/aws-iam';
import { EndpointType } from '@aws-cdk/aws-apigateway';
import * as route53 from "@aws-cdk/aws-route53";
import * as route53Targets from "@aws-cdk/aws-route53-targets";
import * as acm from "@aws-cdk/aws-certificatemanager";

export class InfrastructureStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get hosted zone
    const rootDomain = "openbrewhub.com";
    const zone = route53.HostedZone.fromLookup(this, "OpenBrew Hosted Zone", {
      domainName: rootDomain,
    });

    // Create certificate
    const apiCertificate = new acm.Certificate(this, 'OpenBrew Api Certificate', {
      domainName: `api.${rootDomain}`,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // Create cognito userpool
    const pool = new UserPool(this, 'openbrew-userpool', {
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      selfSignUpEnabled: false,
      userVerification: {
          emailSubject: 'Verify your email for our awesome app!',
          emailBody: 'Thanks for signing up to our awesome app! Your verification code is {####}',
          emailStyle: VerificationEmailStyle.CODE,
          smsMessage: 'Thanks for signing up to our awesome app! Your verification code is {####}',
      }
  });
  const client = pool.addClient('ng-brew-ui');

    // Create dynamo db
    const dynamoTable = new dynamodb.Table(this, 'OpenBrew Recipes Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
    });

    // Lambda functions for api gateway integration
    const getRecipesHandler = new lambda.Function(this, 'OpenBrew GetRecipes', {
      functionName: 'OpenBrew-GetRecipes',
      runtime: lambda.Runtime.PYTHON_3_6,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'getrecipes.lambda_handler',
    });

    const getRecipeHandler = new lambda.Function(this, 'OpenBrew GetRecipe', {
      functionName: 'OpenBrew-GetRecipe',
      runtime: lambda.Runtime.PYTHON_3_6,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'getrecipes.lambda_handler',
    });

    const putRecipeHandler = new lambda.Function(this, 'OpenBrew PutRecipe', {
      functionName: 'OpenBrew-PutRecipe',
      runtime: lambda.Runtime.PYTHON_3_6,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'getrecipes.lambda_handler',
    });

    const postRecipeHandler = new lambda.Function(this, 'OpenBrew PostRecipe', {
      functionName: 'OpenBrew-PostRecipe',
      runtime: lambda.Runtime.PYTHON_3_6,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'getrecipes.lambda_handler',
    });

    const deleteRecipeHandler = new lambda.Function(this, 'OpenBrew DeleteRecipe', {
      functionName: 'OpenBrew-DeleteRecipe',
      runtime: lambda.Runtime.PYTHON_3_6,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'getrecipes.lambda_handler',
    });

    // Grant specific lambda access
    dynamoTable.grantReadData(getRecipesHandler);
    // dynamoTable.grantReadData(getRecipeHandler);
    // dynamoTable.grantWriteData(putRecipeHandler);
    // dynamoTable.grantWriteData(postRecipeHandler);
    // dynamoTable.grantWriteData(deleteRecipeHandler);

    // Merge api-definition with aws specifics
    var mergeYaml = require('merge-yaml');
    var merged = mergeYaml([
      './assets/aws-parts.yaml',
      './assets/openbrew-api.yaml', // Pull from public bucket!
    ]);
    var mergedString = JSON.stringify(merged);

    // Inject lambda arns 
    var preparedString = mergedString.replace(/FreakyLambdaArnGetRecipes/g, getRecipesHandler.functionArn);
    var preparedString = preparedString.replace(/FreakyLambdaArnGetRecipe/g, getRecipeHandler.functionArn);
    var preparedString = preparedString.replace(/FreakyLambdaArnPutRecipe/g, putRecipeHandler.functionArn);
    var preparedString = preparedString.replace(/FreakyLambdaArnPostRecipe/g, postRecipeHandler.functionArn);
    var preparedString = preparedString.replace(/FreakyLambdaArnDeleteRecipe/g, deleteRecipeHandler.functionArn);
    var preparedString = preparedString.replace(/FreakyAccountId/g, this.account);
    var newApiDefinition = JSON.parse(preparedString);

    // Define API from merged open api spec
    const api = new apigateway.SpecRestApi(this, 'OpenBrew Recipes Api', {
      apiDefinition: apigateway.ApiDefinition.fromInline(newApiDefinition),
      endpointTypes: [EndpointType.REGIONAL],
      deployOptions: {
        description: 'This is the common standard api description for the exchange of beer brewing recipes. Cheers.',
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        dataTraceEnabled: true,
        throttlingRateLimit: 1,
        throttlingBurstLimit: 10,
      },
      domainName: {
        domainName: `api.${rootDomain}`,
        certificate: apiCertificate,
      }
    });

    // Create role for api gateway
    const roleName = 'openBrewApiRole';
    const apiRole = new Role(this, 'OpenBrew Api Role', {
      roleName: roleName,
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
    });

    apiRole.addToPolicy(new PolicyStatement({
      resources: ['*'],
      actions: [
        'lambda:InvokeFunction',
        'execute-api:Invoke',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
    })
    );

    // Grant invoke for role
    getRecipesHandler.grantInvoke(apiRole);
    getRecipeHandler.grantInvoke(apiRole);
    putRecipeHandler.grantInvoke(apiRole);
    postRecipeHandler.grantInvoke(apiRole);
    deleteRecipeHandler.grantInvoke(apiRole);


    // Add api gateway dependency for lambdas
    api.node.addDependency(getRecipesHandler);
    api.node.addDependency(getRecipeHandler);
    api.node.addDependency(postRecipeHandler);
    api.node.addDependency(putRecipeHandler);
    api.node.addDependency(deleteRecipeHandler);

    // Enable throttling
    const plan = api.addUsagePlan('OpenBrew Recipes Api Usage Plan', {
      name: 'Default throtteled plan',
      throttle: {
        rateLimit: 10,
        burstLimit: 2
      }
    });

    // Add api key
    const key = api.addApiKey('OpenBrew Recipes ApiKey');
    plan.addApiKey(key);

    // Add usage plan to prod stage    
    plan.addApiStage({
      stage: api.deploymentStage
    });

    // Map api gateways custom domain name to a record
    new route53.ARecord(this, "OpenBrew Api", {
      zone: zone,
      recordName: "api",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGateway(api),
      ),
    });
  }
}