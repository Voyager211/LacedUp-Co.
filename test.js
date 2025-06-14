const bcrypt = require('bcryptjs');
bcrypt.hash('admin123', 12).then(hash => console.log(hash));
