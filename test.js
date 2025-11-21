

const express = require ('express');
const app = express();

app.listen(3000, () => {
    console.log('Server started')
})



 
function method (req, res, next) {
    const method =  req.method;
    console.log (method);
    next();
}

app.use(method);

app.all() 

'/'
'/home'
'/wallet'

all.get ('/', method, (req, res) => {
    res.send ('Products');
} );

app.post('/wallet', async (req, res) => {
    
});


app.listen(3000, () => {

});
