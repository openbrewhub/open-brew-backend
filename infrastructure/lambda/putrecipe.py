import os
import json
import boto3

def lambda_handler(event, context):    
    openbrew_recipe = json.loads(event['body'])
    dynamodb = boto3.resource('dynamodb')
    table_name = os.environ['openbrew_dynamo_table']

    table = dynamodb.Table(table_name)
    response = table.put_item(
       Item={
            openbrew_recipe
        }
    )

    print(response)

    return {
        "statusCode": 201,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": "Welcome from OpenBrew API"
    }