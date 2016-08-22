//Express
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

//Mongo
const MongoClient = require('mongodb').MongoClient
var db
const dbUri = 'mongodb://jeremy:test1234@ds027519.mlab.com:27519/compliance';
MongoClient.connect(dbUri, (err, database) => {
  if (err) return console.log(err)
  db = database
  app.listen(3000, () => {
    console.log('listening on 3000')
  })
})

const RestClient = require('node-rest-client').Client
var restClient = new RestClient();
var Q = require("q");
var _ = require('lodash');

/* Routes */
app.set('view engine', 'ejs')
app.use(bodyParser.json());
app.get('/', (req, res) =>  {
	db.collection('messages').find().toArray(function(err, result) {
		res.render('index.ejs', {messages: result})
	})
})

app.post('/approve', (req, res) => {
  console.log("Approval received " + JSON.stringify(req.body));

  var organizationId = req.body.organizationId; 
  var messageId = req.body.messageId; 
  var approved = req.body.approved; 
  var uri =  "https://apis.hootsuite.com/v1/messages/" + messageId
  //approved ? uri = uri.concat("/approve") : uri = uri.concat("reject") //TODO: Re-enable
  
  getAppToken(organizationId)
    .then(function(appToken) { 
      //TODO: Update to POST endpoint when it's available
      restClient.get(uri, 
          {
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + appToken}
          },
          function (data, response) {
            console.log("Approve Message Response: " + JSON.stringify(data));
          }
      ).on('error', function (err) {
        console.log('Approve Message failed: ', err.request.options);
      });   
    })
  res.status(200)
})

app.post('/webhooks/messageHandler', (req, res) => {
  console.log("Webhook Received: " + JSON.stringify(req.body));
  var messageId = req.body[0].data.message.id;
  var organizationId = req.body[0].data.organization.id;
  var hydratedMessage = {};

  getAppToken(organizationId)
    .then(function(appToken) { 
      // Get Message Metadata
      restClient.get("https://apis.hootsuite.com/v1/messages/" + messageId, 
          {
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + appToken}
          },
          function (data, response) {
            console.log("GET Message Response: " + JSON.stringify(data));
            hydratedMessage = _.assign(data.data[0], req.body[0]); //Merge objects 

            //Save message
            db.collection('messages').save(hydratedMessage, (err, result) => {
              if (err) return console.log(err)

              console.log('Webhooks: Message saved to database')
              res.status(200).json({ message: 'Worked a treat. Bloody Ripper. Beauty mate'})
            })            
          }
      ).on('error', function (err) {
        console.log('GET Message Failed: ', err.request.options);
        res.status(500).json({ message: + 'Oh no that didnt work'})
      });   
    })
})

function getAppToken(orgId) {
  var deferred = Q.defer()
  const credentials = new Buffer("clientId:clientSecret").toString('base64')

  // Get Client Credentials Bearer Token
  restClient.post(
      "https://apis.hootsuite.com/auth/oauth/v2/token", 
      {
        data: "grant_type=client_credentials",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + credentials}
      }, 
      function (data, response) {
        console.log("Get Client Credentials Token Response: " + JSON.stringify(data));
        var bearerToken = data.access_token;

        //Get App Token
        restClient.post(
            "https://apis.hootsuite.com/v1/tokens", 
            {
              data: {memberId: orgId}, //TODO: Set Org-id when avaiable
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + bearerToken}
            }, 
            function (data, response) {
              console.log("Get App Token Repsponse: " + JSON.stringify(data));
              deferred.resolve(data.access_token);
        })
      })
    .on('error', function (err) {
      deferred.reject(err)
    });
  return deferred.promise
}

//A crafted webhook to post to localhost:3000/webhooks/messageHandler. Uses my memberId as a proxy for org ID.
// [
//     {
//         "type":"com.hootsuite.messages.event.v1",
//         "data":{
//             "state":"PENDING_APPROVAL",
//             "organization": {
//                 "id":"12255244"
//             },
//             "message": {
//                 "id":"3929087454"
//             },
//             "timestamp":"2016-07-19T21:51:32.175Z"
//         }
//     }
// ]
