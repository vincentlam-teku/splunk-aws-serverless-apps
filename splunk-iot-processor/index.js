/**
 * Stream events from AWS IoT to Splunk
 *
 * This function streams AWS IoT events to Splunk using Splunk's HTTP event collector API.
 *
 * Define the following Environment Variables in the console below to configure
 * this function to stream events to your Splunk host:
 *
 * 1. SPLUNK_HEC_URL: URL address for your Splunk HTTP event collector endpoint.
 * Default port for event collector is 8088. Example: https://host.com:8088/services/collector
 *
 * 2. SPLUNK_HEC_TOKEN: Token for your Splunk HTTP event collector.
 * To create a new token for this Lambda function, refer to Splunk Docs:
 * http://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector#Create_an_Event_Collector_token
 *
 * Once Lambda function created, add an AWS IoT Rule with Lambda action set to this function name.
 * For more details, including adding permissions to AWS IoT to invoke Lambda, refer to AWS Docs:
 * http://docs.aws.amazon.com/iot/latest/developerguide/iot-lambda-rule.html#iot-create-lambda-rule
 * http://docs.aws.amazon.com/iot/latest/developerguide/lambda-rule.html
 *
 * For details about Splunk logging library used below: https://github.com/splunk/splunk-javascript-logging
 */

'use strict';

const loggerConfig = {
    url: process.env.SPLUNK_HEC_URL,
    token: process.env.SPLUNK_HEC_TOKEN,
    maxBatchCount: 0, // Manually flush events
    maxRetries: 3,    // Retry 3 times
};

const SplunkLogger = require('splunk-logging').Logger;

const logger = new SplunkLogger(loggerConfig);

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    // First, configure logger to automatically add Lambda metadata and to hook into Lambda callback
    configureLogger(context, callback); // eslint-disable-line no-use-before-define

    /* Send item to Splunk with optional metadata properties such as time, index, source, sourcetype, and host.
    - Set time value below if you want to explicitly set event timestamp.
    - Set or remove other metadata properties as needed. For descripion of each property, refer to:
    http://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTinput#services.2Fcollector */
    logger.send({
        message: event,
        metadata: {
            host: 'serverless',
            source: `lambda:${context.functionName}`,
            sourcetype: 'httpevent',
            //time: Date.now(),
            //index: 'main',
        },
    });

    // Flush event to Splunk
    logger.flush((err, resp, body) => {
        // Request failure or valid response from Splunk with HEC error code
        if (err || (body && body.code !== 0)) {
            // If failed, error will be handled by pre-configured logger.error() below
        } else {
            // If succeeded, body will be { text: 'Success', code: 0 }
            console.log('Response from Splunk:', body);
            callback(null, event); // Echo back event itself
        }
    });
};

const configureLogger = (context, callback) => {
    // Override SplunkLogger default formatter
    logger.eventFormatter = (event) => {
        // Enrich event only if it is an object
        if (typeof event === 'object' && !Object.prototype.hasOwnProperty.call(event, 'awsRequestId')) {
            // Add awsRequestId from Lambda context for request tracing
            event.awsRequestId = context.awsRequestId; // eslint-disable-line no-param-reassign
        }
        return event;
    };

    // Set common error handler for logger.send() and logger.flush()
    logger.error = (error, payload) => {
        console.log('error', error, 'context', payload);
        callback(error);
    };
};
