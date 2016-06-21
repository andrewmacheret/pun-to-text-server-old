var port = process.env.PORT || 80;

/////

var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var os = require('os');
var fs = require('fs');

var app = express();
//var urlencode = require('urlencode');
app.use(bodyParser.json());

var FACEBOOK_APP_ID = '989407984511528';
var FACEBOOK_APP_SECRET = '47621f66683c0be7df893f764d42dc67';

passport.use(new FacebookStrategy({
    clientID: FACEBOOK_APP_ID,
    clientSecret: FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/puntotext');
var Schema = mongoose.Schema;
var ObjectId = require('mongoose').Types.ObjectId; 
String.prototype.toObjectId = function() {
  return new ObjectId(this.toString());
};


function send(res, json, code) {
  if (code) {
    // code given
    res.status(code);
  } else if (json.error) {
    // server error
    res.status(500);
  } else if (!json.success) {
    // not found
    res.status(404);
  }
  var msg = JSON.stringify(json);
  console.log(msg);
  res.set({
    'Content-Type': 'application/json'
  });
  res.send(msg);
}

function debug(name, obj) {
  console.log(name + ': ' + JSON.stringify(obj, 0, 4));
}



var userSchema = new Schema({
  first: {type: String, required: true},// validate: /^.+$/},
  middle: {type: String, required: false},// validate: /^.+$/},
  last: {type: String, required: true},// validate: /^.+$/},
  imageSource: {type: String, required: true},
  answers: [answerSchema]
});

var answerSchema = new Schema({
  question: {type: String, required: true},
  answer: {type: String, required: true}
});

var employeeSchema = new Schema({
  first: {type: String, required: true},// validate: /^.+$/},
  middle: {type: String, required: false},// validate: /^.+$/},
  last: {type: String, required: true},// validate: /^.+$/},
  imageSource: {type: String, required: true},
  answers: [answerSchema]
});
employeeSchema.index({first: 1, middle: 1, last: 1}, {unique: true});
var Employee = mongoose.model('Employee', employeeSchema);

var questionSchema = new Schema({
  text: {type: String, required: true, validate: /^.+$/, unique: true}
});
var Question = mongoose.model('Question', questionSchema);


function buildLimitQuery(req, defaultLimit, maxLimit) {
  if (!defaultLimit) defaultLimit = 10;
  if (!maxLimit) maxLimit = 100;
  
  var start = parseInt(req.query._start, 10) || 0;
  var limit = parseInt(req.query._limit, 10) || defaultLimit;
  if (start < 0) start = 0;
  if (limit <= 0 || limit > maxLimit) limit = defaultLimit;
  return {skip: start, limit: limit};
}

function buildIdQuery(req) {
  return {_id: req.params._id.toObjectId()};
}

function parseBasicAuth(req) {
  // get the header
  var header = req.headers['authorization'] || '';
  
  // and the encoded auth token
  var token = header.split(/\s+/).pop() || '';
  
  // convert from base64
  var auth = new Buffer(token, 'base64').toString();
  
  // split on colon
  var parts = auth.split(/:/);
  
  return parts.length === 2 ? {username: parts[0], password: parts[1]} : {};
}


// QUESTION


function parseQuestion(req) {
  var questionJson = {};
  
  questionJson.text = req.body.text;
  
  return new Question(questionJson);
}

app.get('/question', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var options = buildLimitQuery(req);
  
  Question.find({}).skip(options.skip)
                   .limit(options.limit)
                   .sort({text: 'asc'})
                   .exec(function(err, questions) {
    if (err) {
      send(res, {success: false, location: 'Question.find', error: err});
      return;
    }

    send(res, {success: true, _start: options.skip, _limit: options.limit, questions: questions});
  });
});

app.post('/question', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var question = parseQuestion(req);
  
  question.save(function (err, question) {
    if (err) {
      send(res, {success: false, location: 'question.save', error: err});
      return;
    }
    
    send(res, {success: !!question, question: question});
  });
});

app.get('/question/:_id', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var conditions = buildIdQuery(req);
  
  Question.findOne(conditions, function(err, question) {
    if (err) {
      send(res, {success: false, location: 'Question.findOne', error: err});
      return;
    }
    
    send(res, {success: !!question, question: question});
  });
});

app.delete('/question/:_id', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var conditions = buildIdQuery(req);
  
  Question.remove(conditions, function(err, numAffected) {
    if (err) {
      send(res, {success: false, location: 'Question.remove', error: err});
      return;
    }
    
    send(res, {success: numAffected == 1, numAffected: numAffected});
  });
});

app.put('/question/:_id', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var conditions = buildIdQuery(req);
  var upsert = {upsert: true, multi: false};
  
  var question = parseQuestion(req).toObject();
  delete question._id;
  
  Question.update(conditions, question, upsert, function(err, numAffected) {
    if (err) {
      send(res, {success: false, location: 'Question.update', error: err});
      return;
    }
    
    send(res, {success: numAffected == 1, numAffected: numAffected});
  });
});


// EMPLOYEE


function parseEmployee(req) {
  var employeeJson = {};
  
  // get basic info
  employeeJson.first = req.body.first || '';
  employeeJson.middle = req.body.middle || '';
  employeeJson.last = req.body.last || '';
  
  // parse answers
  answers = [];
  var i = 0;
  while (true) {
    var question = req.body['question' + i];
    if (!question) {
      break;
    }
    var answer = req.body['answer' + i];
    if (answer) {
      answers.push({question: question, answer: answer});
    }
    i++;
  }
  employeeJson.answers = answers;
  
  // get image source of the uploaded image file
  var imageFile = req.files.imageFile;
  if (imageFile) {
    employeeJson.imageSource = '/images/' + imageFile.name;
  }
  
  return new Employee(employeeJson);
}

function cleanupFiles() {
  console.log('cleaning up unnecessary images...');
  
  // find all images used for employees
  Employee.find({}, '-_id imageSource', function(err, employeeStubs) {
    if (err) return console.log(err);
    
    // keep track of all image paths found
    var imagesToKeep = {};
    employeeStubs.forEach(function(employeeStub) {
      imagesToKeep[employeeStub.imageSource] = true;
    });
    
    // find all files in the images directory
    fs.readdir(imagesPath, function(err, files) {
      if (err) return console.log(err);
      
      // compute a date that is 1 hour ago from right now
      var livesUntil = new Date();
      livesUntil.setHours(livesUntil.getHours() - 1);
      livesUntil = livesUntil.getTime();
      
      // loop through each file in the images directory
      files.forEach(function(file, i) {
        var filePath = imagesPath + '/' + file;
        
        // if the image is in use by an employee, do not continue
        if (imagesToKeep['/images/' + file]) {
          console.log('skipping - file in use: ' + filePath);
          return;
        }
        
        // if the image doesn't start with a 13 digit timestamp and a dash, do not continue
        if (!file.match(/^[0-9]{13}-/)) {
          console.log('skipping - file does not start with timestamp: ' + filePath);
          return;
        }
        
        // get stats on the file (we want the last modified time)
        fs.stat(filePath, function(err, stat) {
          if (err) return console.log(err);
          
          // get the last modified time
          var modified = new Date(stat.mtime).getTime();
          
          // if the file has been modified within the last hour, do not touch it
          if (modified > livesUntil) {
            console.log('skipping - file too new to delete: ' + filePath);
            return;
          }
          
          // file is old and not used ... we can delete it safely
          fs.unlink(filePath, function(err) {
            if (err) return console.log(err);
            
            // log that the file was deleted
            console.log('deleted: ' + filePath);
          });
        });
      });
    });
  });
}

app.post('/employee', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var employee = parseEmployee(req);
  
  employee.save(function (err, employee) {
    if (err) {
      send(res, {success: false, location: 'employee.save', error: err});
      return;
    }

    send(res, {success: !!employee, employee: employee});
  });
});

app.get('/employee', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var options = buildLimitQuery(req);
  
  Employee.find({}).skip(options.skip)
                   .limit(options.limit)
                   .sort({last: 'asc', first: 'asc', middle: 'asc'})
                   .exec(function(err, employees) {
    if (err) {
      send(res, {success: false, location: 'Employee.find', error: err});
      return;
    }

    send(res, {success: true, _start: options.skip, _limit: options.limit, employees: employees});
  });
});

app.get('/employee/:_id', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var conditions = buildIdQuery(req);
  
  Employee.findOne(conditions, function(err, employee) {
    if (err) {
      send(res, {success: false, location: 'Employee.findOne', error: err});
      return;
    }
    
    send(res, {success: !!employee, employee: employee});
  });
});

app.delete('/employee/:_id', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var conditions = buildIdQuery(req);
  
  Employee.remove(conditions, function(err, numAffected) {
    if (err) {
      send(res, {success: false, location: 'Employee.remove', error: err});
      return;
    }
    
    send(res, {success: numAffected == 1, numAffected: numAffected});
    
    cleanupFiles();
  });
});

app.put('/employee/:_id', function(req, res) {
  if (!checkPermissions(req, res)) return;
  
  var conditions = buildIdQuery(req);
  var upsert = {upsert: true, multi: false};
  
  var employee = parseEmployee(req).toObject();
  delete employee._id;
  
  var sendMail = req.body.sendMail || false;
  
  Employee.update(conditions, employee, upsert, function(err, numAffected) {
    if (err) {
      send(res, {success: false, location: 'Employee.update', error: err});
      return;
    }
    
    send(res, {success: numAffected == 1, numAffected: numAffected});
    
    cleanupFiles();
    
    if (sendMail) {
      var name = employee.first + (employee.middle != '' ? ' ' + employee.middle : '') + ' ' + employee.last;
      var subject = 'Hats Off to Welcome - ' + name + '!';
      var title = '{title}'; //employee.title
      var html = '<p>Fellow DeVeroans</p>'
        + '<p>' + employee.first  + ' joined the team today, as a ' + title + '. Take a minute to learn a bit about her and welcome her to the team!</p>';
        + '<p>{image}</p>'
        + '<p>{questions-and-answers}</p>'
        + '<p>If you see ' + employee.first + ' around be sure to welcome her aboard!</p>';
      var text = html.replace(/<p>/, '').replace(/<\/p>/, '\n\n');
      var options = {
        from: 'andrewm@devero.com',
        to: 'andrewm@devero.com',
        subject: subject,
        text: text,
        html: html
      };
      transport.sendMail(options, function(err, info) {
        if (err) {
          send(res, {success: false, location: 'transport.sendMail', error: err});
          return;
        }
        
        console.log('Email sent: ' + subject);
      });
    }
  });
});



// Listen

app.listen(port);
console.log('listening on ' + port);

