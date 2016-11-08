var request = require('request');
var aws = require('aws-sdk');

exports.handler = function(event, context) {
    console.log('EVENT:', JSON.stringify(event, null, 2));

    // Event Object取得(LINE MessagingAPI)
    var event_data = JSON.parse(event.body);
    var reply_token = event_data.events[0].replyToken;
    var receive_message_type = event_data.events[0].message.type;
    var receive_id = '';

    if (!event_data.events[0].source.groupId){
        receive_id = event_data.events[0].source.userId;
    } else {
        receive_id = event_data.events[0].source.groupId;
    }

    // Docomo雑談API
    var APIKEY = 'API key';
    var docomo_options = {
        url: 'https://api.apigw.smt.docomo.ne.jp/dialogue/v1/dialogue?APIKEY=' + APIKEY,
        headers: {
            "Content-Type": "application/json"
        },
        body: '',
        json: true
    };

    // LINE MessagingAPI
    var sendOptions = {
        url: 'https://api.line.me/v2/bot/message/reply',
        headers: {
            "Content-type": "application/json; charset=UTF-8",
            "Authorization": " Bearer " + "{Channel Access Token}"
        },
        body: '',
        json: true
    };

    // LINEへの送信データ
    var line_body = {
      replyToken: reply_token,
      messages:[
                {
                    "type":"text",
                    "text":""
                }
            ]
    };

    // DynamoDB Object
    var dynamo = new aws.DynamoDB.DocumentClient();

    var dbparams = {};
    dbparams.TableName = "Table Name";

    //会話の場合はcontextとmodeを引き継ぐ
    if (receive_message_type == 'text') {
        var receive_message = event_data.events[0].message.text;

        // Docomo雑談APIへの送信データ DynamoDB
        var docomo_body = {
           "utt": receive_message,
           "t": "20" // 関西弁やで
         };

        // 検索キー
        dbparams.Key = {
                mid: receive_id
            };

        // DynamoDBから Contextとmodeがあるか検索
        dynamo.get(dbparams, function(err, data) {
                if (err) {
                    console.log(err, err.stack);
                } else {
                    console.log('get item from DynamoDB.');
                    if (Object.keys(data).length > 0 && data.Item.context){
                        // Contextとmodeがあれば含めてDocomo雑談APIへPOST
                        docomo_body.context = data.Item.context;
                        docomo_body.mode = data.Item.mode;
                    }
                }

                docomo_options.body = docomo_body;
                request.post(docomo_options, function (error, response, ret) {
                    if (!error) {
                        console.log(ret);

                        // DynamoDBに入れる
                        var UpdateDBparams = {
                            TableName: dbparams.TableName,
                            Item: {
                                "mid": receive_id,
                                "context": ret.context,
                                "mode": ret.mode
                            }
                        };
                        console.log('put to DynamoDB.');
                        dynamo.put(UpdateDBparams, function(err, data) {
                            if (err) {
                                console.log(err, err.stack);
                            } else {
                              line_body.messages[0].text = ret.utt;
                              sendOptions.body = line_body;

                              request.post(sendOptions, function(error, response, body){
                                  if (!error) {
                                      console.log(JSON.stringify(response));
                                      console.log(JSON.stringify(body));
                                      console.log('send to LINE.');

                                      context.succeed('done.');

                                  } else {
                                      console.log('error: ' + JSON.stringify(error));
                                  }
                              });
                            }
                        });
                    }
                });
        });
    }
};
