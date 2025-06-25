// const arr = [1, 6, 2, 3, 4, 5];
// const str = 'welcome';

const express = require ('express');
const router = express.Router();
const app = express();



// db.collection.updateMany({department: "tech", age: {$lt: 25}}, {
//     salary: {$mul: {$inc: -1 }, 10}
// })





// function errorHandler = (err, req, res, next) {
//     if (err){
//         console.error ('Some error occurred');
//     } 
    
    
//     next();
// }

// app.use (errorHandler);

// app.get ('/home', errorHandler, (req, res) => {
//     res.send ("Home");
// })



 
function method (req, res, next) {
    const method =  req.method;
    console.log (method);
    next();
}
app.use()
router.get ('/', method, (req, res) => {
    res.send ('Products');
} );


router.listen(3000, () => {
    
});


// const squared = arr.forEach (num => {
//     num * num;
// });

// console.log (squared);

// const squared = arr.map(num => num * num);

// console.log (squared);







//     function space (str) {
//         let result = "";
//         for (let i = 0; i < str.length; i++) {
//             result = result + str[i] + " ";
//         }
        
//         return result;
//     }

// console.log (space(str));






// function secondLargest (arr) {
//     let largest = 0;
//     let secondLargest = 0;
    
//     for (let i = 0; i < arr.length-1; i++) {
//         for (let j = i+1; j < arr.length; j++) {
//             if (arr [i] > arr[j]) {
//                 largest = arr[i];
//                 secondLargest = arr[j];
//             }
            
//         }
//     }
//     return secondLargest;
// }

// console.log (secondLargest(arr));