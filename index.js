const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require("bcrypt");
const app = express();
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();

const port = process.env.PORT;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); 

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DATABASE,
    port: process.env.DB_PORT
});

let isConnect = false;

db.on('error', (err)=>{
    console.log("DB Connection failed, \nError: " + err);
})
db.on('connect', (stream)=>{
    isConnect = true;
    console.log('DB connected!');
})

app.listen(port, ()=>{
    console.log("Server running. Port: "+ port);
    async function reset_user_details(){
        db.query('UPDATE user_details SET temperature=0, blood_pressure=0', (err, data)=>{
            if (err) {
                console.log('Failed to reset sensor details');
                clearInterval(reseting);
            }
        })
    }
    const reseting = setInterval(reset_user_details, 300000)
});

app.get('/', (req, res)=>{
  res.json({Server: "Online", Port: port, Database_connected: isConnect});  
})

// register
app.post('/users/register', async (req, res)=>{
    const name = req.body.name; 
    const phone = req.body.phone; 
    const password = req.body.password;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('SELECT * FROM users WHERE phone = ?', [phone], (err, data)=>{
        if(err) return res.status(500).json({message: "Error!", sqlError: err.sqlMessage});
        
        if (data.length > 0) {
            res.json({message: "User already registered", status: 409});
        }else{
            const uid = Math.floor(Math.random() * 10000000);
            const sql = "INSERT INTO users (user_id, user_name, phone, password, pregnant_date) VALUES(? , ? , ? , ?, ? )";

            db.query(sql, [uid, name, phone, hashedPassword, '1900-01-01'], (err, data)=>{
                if(err) return res.status(500).json({message: "Error!", sqlError: err.sqlMessage});
                res.json({message: "Account created successfully"});

                // register a user_details row
                db.query("INSERT INTO user_details (user_id, temperature, blood_pressure) VALUES(? , ? , ? )", [uid, 0, 0], (err, data)=>{
                    if (err) return res.json({error: "Failed to register well user!"});
                });
                // register a user_details row

                console.log(name + " created an account");
                
            });
        }
    
    })
});

// Login
app.post('/users/login', (req, res)=>{
    const phone = req.body.phone; 
    const password = req.body.password;
    const sql = "SELECT user_id, user_name, pregnant_date, phone, password FROM users WHERE phone = ?";
    db.query(sql, [phone, password], async (err, data)=>{
        if(err) return res.status(500).json({message: "Error!"});
        if(data.length > 0){
            const db_pswd = data[0].password;
                if (await bcrypt.compare(password, db_pswd)){
                    res.json({message: "Login successful", user: data[0]});
                }else{
                    res.json({message: "Access denied", status: 401});
                }
        }else{
            res.json({message: "Invalid phone number", status: 401});
        }
    });
});

// user details
app.post('/users/update', (req, res)=>{
    const id = req.query.id;
    const date = req.body.pregDate; 
    // console.log(id);
    
    const sql = `UPDATE users SET pregnant_date = '${date}' WHERE user_id = '${id}'`; 
    db.query(sql, (err,data)=>{
        if (err) return res.json({message: err.sqlMessage});
        res.json({success: "Date updated"});
    }); 
})



// =================== User status ===================

// get user status
app.get('/users/status', (req, res)=>{
    const id = req.query.id; 
    const sql = "SELECT temperature, blood_pressure, real_blood_pressure FROM user_details WHERE user_id = ?"; 
    db.query(sql, [id], (err,data)=>{
        if (err) return res.json({message: err.sqlMessage});
        res.json({user_status: data[0]});
    }); 
})


// =================== notes ===================

// view all notes
app.get('/notes/view', (req, res)=>{
    const id = req.query.id; 
    const sql = "SELECT id, note FROM notes WHERE user_id = ?"; 
    db.query(sql, [id], (err,data)=>{
        if (err) return res.json({message: err.sqlMessage});
        res.json({data});
    }); 
})

// Add a new note
app.post('/notes/add', (req, res)=>{
    const id = req.body.id; 
    const note = req.body.note; 
    const sql = "INSERT INTO notes (user_id, note) values( ? , ? )"; 
    db.query(sql, [id, note], (err,data)=>{
        if (err) return res.json({message: err.sqlMessage});
        res.json({success: "Note Saved"});
    }); 
})

// Delete a note
app.get('/notes/delete', (req, res)=>{
    const id = req.query.id; 
    const sql = "DELETE FROM notes WHERE id = ?"; 
    db.query(sql, [id], (err,data)=>{
        if (err) return res.json({message: err.sqlMessage});
        res.json({success: "Note Deleted"});
    }); 
})


// =================== messages ===================

app.post('/users/messages/send', (req, res) => {
    const sender_id = req.body.sender_id; 
    const receiver_id = req.body.receiver_id; 
    const message = req.body.message;
    const msg_id = Math.floor(Math.random() * 100000);
    const sql = "INSERT INTO messages (msg_id, sender_id, receiver_id, message_sent, isRead) VALUES (?, ?,?,?,?)";
    db.query(sql, [msg_id, sender_id, receiver_id, message, 0], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});

        const fetch = `
            SELECT messages.msg_id, messages.message_sent as message, messages.receiver_id, sender_id FROM users INNER JOIN messages ON users.user_id=messages.sender_id OR users.user_id=messages.receiver_id WHERE messages.sender_id = ? OR (messages.sender_id= 'admin' AND messages.receiver_id = ?) ORDER BY messages.id;

        `;
        db.query(fetch, [sender_id, sender_id], (err, result) => {
            res.json(result);
        })
        
    });

})

// view messages
app.get('/users/messages/view', (req, res) => {
    const sender_id = req.query.id;
    // const sql = "SELECT messages.message_sent as sender_message FROM users INNER JOIN messages ON users.user_id=messages.sender_id WHERE messages.receiver_id='admin' AND messages.sender_id= ?"
    const sql = `
    SELECT messages.msg_id, messages.message_sent as message, messages.receiver_id, sender_id FROM users INNER JOIN messages ON users.user_id=messages.sender_id OR users.user_id=messages.receiver_id WHERE messages.sender_id = ? OR (messages.sender_id= 'admin' AND messages.receiver_id = ?) ORDER BY messages.id;
    `;
    // console.log(sender_id);
    
    db.query(sql, [sender_id, sender_id], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        res.json(result);
    })
})


// /////////////////////////////////////////  ADMIN  ///////////////////////////////////////////////////////////////
// Login
app.post('/admin/login', (req, res)=>{
    const email = req.body.email; 
    const password = req.body.password;
    const sql = "SELECT name, email, password FROM admin WHERE email = ?";
    db.query(sql, [email], async (err, result)=>{
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});

        if(result.length > 0){
            const hashedPassword = result[0].password;
            bcrypt.compare(password, hashedPassword, (err, result)=>{
                if(err) return res.json({error: "Operation failed", message: err.sqlMessage});
                if(result){
                    res.json({success: "Login successful"});
                }else{
                    res.json({error: "Incorrect password"});
                }
            });    
        }else{
            res.json({error: "Invalid Credentials"});
        }
    });
});

// stats fetching 
app.get('/admin/stats', (req, res) => {
    const stats = [];
    const sql1 = "SELECT COUNT(*) as total_users FROM users WHERE user_name !='000000'";
    db.query(sql1, (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        stats.push({total_users: result[0].total_users});
        // res.json(stats);
    });
    
    const sql2 = "SELECT COUNT(*) as total_messages FROM messages";
    db.query(sql2, (err, result) => {
        // console.log(stats);
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        stats.push({total_messages: result[0].total_messages});
        res.json(stats);
    });
})

// recent activities
app.get('/admin/recent', (req, res) => {
    const recent_activities = [];
    const sql1 = "SELECT user_name as recent FROM users WHERE user_name !='000000' ORDER BY id DESC LIMIT 1";
    db.query(sql1, (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        recent_activities.push(result[0]);
        // res.json(recent_activities);
    });
    
    const sql2 = "SELECT COUNT(*) as total_messages FROM messages where isRead = 0 ";
    db.query(sql2, (err, result) => {
        // console.log(recent_activities);
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        recent_activities.push({total_messages: result[0].total_messages});
        res.json(recent_activities);
    });
})

// view all users
app.get('/admin/users', (req, res) => {
    const sql = "SELECT users.user_id, users.user_name, users.phone, users.pregnant_date, user_details.temperature, user_details.blood_pressure, user_details.real_blood_pressure FROM users INNER JOIN user_details ON users.user_id=user_details.user_id";
    db.query(sql, (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        res.json(result);
    });
})

// =================== Messages =================
app.get('/admin/message/view/all', (req, res) => {
    // const id = req.query.id;
    const sql = `
        SELECT DISTINCT users.user_name, messages.isRead, messages.sender_id
        FROM users
        INNER JOIN messages ON users.user_id = messages.sender_id
        WHERE messages.receiver_id = 'admin';
    `;
    db.query(sql, (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        res.json(result);
    });
})

app.get('/admin/message/view/single', (req, res) => {
    const sender_id = req.query.id;
    // const sql = "SELECT messages.message_sent as sender_message FROM users INNER JOIN messages ON users.user_id=messages.sender_id WHERE messages.receiver_id='admin' AND messages.sender_id= ?"
    const sql = `
    SELECT messages.msg_id, messages.message_sent as message, messages.receiver_id, sender_id FROM users INNER JOIN messages ON users.user_id=messages.sender_id OR users.user_id=messages.receiver_id WHERE messages.sender_id= ? OR (messages.sender_id='admin' AND messages.receiver_id= ?) ORDER BY messages.id;
    `;
    
    db.query(sql, [sender_id, sender_id], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        res.json(result);
    })
})

app.get('/admin/message/view/read', (req, res) => {
    const sender_id = req.query.id;
    const sql = "UPDATE messages SET isRead = 1 WHERE sender_id = ?";
    db.query(sql, [sender_id], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        // res.json({success: "Message read status updated"});
    }) 
    
})


app.post('/admin/message/send', (req, res) => {
    const message = req.body.message;
    const receiver_id = req.body.receiver_id;
    const msg_id = Math.floor(Math.random() * 100000);
    const sql = "INSERT INTO messages (msg_id, sender_id, receiver_id, message_sent, isRead) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [msg_id, 'admin', receiver_id, message, 1], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});

        // fetch new messages

        const fetch = `
        SELECT messages.msg_id, messages.message_sent as message, messages.receiver_id, sender_id FROM users INNER JOIN messages ON users.user_id=messages.sender_id OR users.user_id=messages.receiver_id WHERE messages.sender_id= ? OR (messages.sender_id='admin' AND messages.receiver_id= ?) ORDER BY messages.id;
        `;
        db.query(fetch, [receiver_id, receiver_id], (err, result) => {
            res.json(result);
        })
    })
})

// ================= profile updating =================
app.post('/admin/update', (req, res) => {
    const email = req.body.email;
    const name = req.body.name;
    const password = req.body.password;
    
    const sql = `
    UPDATE admin SET email = ?, name = ?, password = ?
    ` 
    db.query(sql, [email, name, password], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        res.json({success: "Profile updated"});
    })
})

app.post('/admin/verify', (req, res) => {
    const user_id = req.body.user_id;
    const verify = req.body.verify;
    
    const sql = `UPDATE users SET verified = ? WHERE user_id = ?` 
    db.query(sql, [verify, user_id], (err, result) => {
        if (err) return res.json({error: "Operation failed", message: err.sqlMessage});
        res.json({success: "User Account activated"});
    })
})
