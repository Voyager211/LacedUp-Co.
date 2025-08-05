const Address = require('../../models/Address');
const User = require('../../models/User');

// Add new address
exports.addAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to add address'
      });
    }

    // Validate required fields
    const { fullName, mobileNumber, addressDetails, state, district, city, pincode, addressType } = req.body;
    
    if (!fullName || !mobileNumber || !addressDetails || !state || !district || !city || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate field formats
    if (fullName.trim().length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 4 characters long'
      });
    }

    if (!/^[6-9]\d{9}$/.test(mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number'
      });
    }

    if (req.body.altPhone && !/^[6-9]\d{9}$/.test(req.body.altPhone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit alternative phone number'
      });
    }

    if (addressDetails.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Address details must be at least 10 characters long'
      });
    }

    if (!/^[1-9]\d{5}$/.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit pincode'
      });
    }

    if (city.trim().length < 2 || !/^[a-zA-Z\s]+$/.test(city.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid city name'
      });
    }

    if (!['home', 'office', 'other'].includes(addressType)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid address type'
      });
    }

    // Create new address object
    const newAddress = {
      addressType: addressType,
      name: fullName.trim(),
      city: city.trim(),
      landMark: addressDetails.trim(),
      state: state,
      pincode: parseInt(pincode.trim()),
      phone: mobileNumber.trim(),
      altPhone: req.body.altPhone ? req.body.altPhone.trim() : '',
      isDefault: false
    };

    // Add coordinates if provided
    if (req.body.coordinates && req.body.coordinates.lat && req.body.coordinates.lon) {
      newAddress.coordinates = {
        lat: req.body.coordinates.lat,
        lon: req.body.coordinates.lon
      };
    }

    // Find or create user's address document
    let userAddresses = await Address.findOne({ userId });
    
    if (!userAddresses) {
      // First address for user - make it default
      newAddress.isDefault = true;
      userAddresses = new Address({
        userId: userId,
        address: [newAddress]
      });
    } else {
      // Check if user wants this as default or if it's their first address
      if (req.body.makeDefault === true || userAddresses.address.length === 0) {
        // Unset all existing defaults
        userAddresses.address.forEach(addr => {
          addr.isDefault = false;
        });
        newAddress.isDefault = true;
      }
      
      // Add new address to array
      userAddresses.address.push(newAddress);
    }

    await userAddresses.save();

    res.json({
      success: true,
      message: 'Address added successfully'
    });

  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address. Please try again.'
    });
  }
};

// Update existing address
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const addressId = req.params.addressId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to update address'
      });
    }

    // Validate required fields
    const { fullName, mobileNumber, addressDetails, state, district, city, pincode, addressType } = req.body;
    
    if (!fullName || !mobileNumber || !addressDetails || !state || !district || !city || !pincode || !addressType) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate field formats (same as add)
    if (fullName.trim().length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 4 characters long'
      });
    }

    if (!/^[6-9]\d{9}$/.test(mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number'
      });
    }

    if (req.body.altPhone && !/^[6-9]\d{9}$/.test(req.body.altPhone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit alternative phone number'
      });
    }

    if (addressDetails.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Address details must be at least 10 characters long'
      });
    }

    if (!/^[1-9]\d{5}$/.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit pincode'
      });
    }

    if (city.trim().length < 2 || !/^[a-zA-Z\s]+$/.test(city.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid city name'
      });
    }

    if (!['home', 'office', 'other'].includes(addressType)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid address type'
      });
    }

    // Find user's address document
    const userAddresses = await Address.findOne({ userId });

    if (!userAddresses) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Find the specific address to update
    const addressIndex = userAddresses.address.findIndex(addr => addr._id.toString() === addressId);

    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update address fields
    const addressToUpdate = userAddresses.address[addressIndex];
    addressToUpdate.addressType = addressType;
    addressToUpdate.name = fullName.trim();
    addressToUpdate.city = city.trim();
    addressToUpdate.landMark = addressDetails.trim();
    addressToUpdate.state = state;
    addressToUpdate.pincode = parseInt(pincode.trim());
    addressToUpdate.phone = mobileNumber.trim();
    addressToUpdate.altPhone = req.body.altPhone ? req.body.altPhone.trim() : '';

    // Update coordinates if provided
    if (req.body.coordinates && req.body.coordinates.lat && req.body.coordinates.lon) {
      addressToUpdate.coordinates = {
        lat: req.body.coordinates.lat,
        lon: req.body.coordinates.lon
      };
    }

    // Handle default address setting
    if (req.body.makeDefault === true) {
      // Unset all existing defaults
      userAddresses.address.forEach(addr => {
        addr.isDefault = false;
      });
      addressToUpdate.isDefault = true;
    }

    await userAddresses.save();

    res.json({
      success: true,
      message: 'Address updated successfully'
    });

  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address. Please try again.'
    });
  }
};

// Get all addresses for a user
exports.getAddresses = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to view addresses'
      });
    }

    const userAddresses = await Address.findOne({ userId }).lean();
    const addresses = userAddresses ? userAddresses.address : [];

    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses'
    });
  }
};

// Get a single address by ID
exports.getAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const addressId = req.params.addressId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to view address'
      });
    }

    // Find user's address document
    const userAddresses = await Address.findOne({ userId }).lean();

    if (!userAddresses) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Find the specific address
    const address = userAddresses.address.find(addr => addr._id.toString() === addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      address
    });
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch address'
    });
  }
};


// Delete address
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const addressId = req.params.addressId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to delete address'
      });
    }

    // Find user's address document
    const userAddresses = await Address.findOne({ userId });

    if (!userAddresses) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Find the specific address to delete
    const addressIndex = userAddresses.address.findIndex(addr => addr._id.toString() === addressId);

    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Check if this is the only address and it's default
    const isDefault = userAddresses.address[addressIndex].isDefault;
    
    // Remove the address
    userAddresses.address.splice(addressIndex, 1);

    // If the deleted address was default and there are other addresses, make the first one default
    if (isDefault && userAddresses.address.length > 0) {
      userAddresses.address[0].isDefault = true;
    }

    await userAddresses.save();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address'
    });
  }
};

// Set default address
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const addressId = req.params.addressId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to set default address'
      });
    }

    // Find user's address document
    const userAddresses = await Address.findOne({ userId });

    if (!userAddresses) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Find the specific address to set as default
    const addressIndex = userAddresses.address.findIndex(addr => addr._id.toString() === addressId);

    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Unset all defaults and set the selected one as default
    userAddresses.address.forEach((addr, index) => {
      addr.isDefault = index === addressIndex;
    });

    await userAddresses.save();

    res.json({
      success: true,
      message: 'Default address updated successfully'
    });

  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address'
    });
  }
};

// Load addresses page
exports.loadAddresses = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user addresses
    const userAddresses = await Address.findOne({ userId }).lean();
    const addresses = userAddresses ? userAddresses.address : [];

    res.render('user/address-book', {
      user,
      addresses,
      title: 'Address Book - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'addresses',
      geoapifyApiKey: process.env.GEOAPIFY_API_KEY
    });
  } catch (error) {
    console.error('Error loading addresses page:', error);
    res.status(500).render('error', { message: 'Error loading addresses page' });
  }
};

// Get states and districts data
exports.getStatesAndDistricts = async (req, res) => {
  try {
    // Indian states and districts data
    const stateDistrictData = {
      "andhra-pradesh": {
        name: "Andhra Pradesh",
        districts: ["Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "Nellore", "Prakasam", "Srikakulam", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"]
      },
      "arunachal-pradesh": {
        name: "Arunachal Pradesh",
        districts: ["Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"]
      },
      "assam": {
        name: "Assam",
        districts: ["Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Dima Hasao", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tinsukia", "Udalguri", "West Karbi Anglong"]
      },
      "bihar": {
        name: "Bihar",
        districts: ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"]
      },
      "chhattisgarh": {
        name: "Chhattisgarh",
        districts: ["Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela Pendra Marwahi", "Janjgir Champa", "Jashpur", "Kabirdham", "Kanker", "Kondagaon", "Korba", "Koriya", "Mahasamund", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sukma", "Surajpur", "Surguja"]
      },
      "goa": {
        name: "Goa",
        districts: ["North Goa", "South Goa"]
      },
      "gujarat": {
        name: "Gujarat",
        districts: ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"]
      },
      "haryana": {
        name: "Haryana",
        districts: ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"]
      },
      "himachal-pradesh": {
        name: "Himachal Pradesh",
        districts: ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"]
      },
      "jharkhand": {
        name: "Jharkhand",
        districts: ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahebganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum"]
      },
      "karnataka": {
        name: "Karnataka",
        districts: ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Yadgir"]
      },
      "kerala": {
        name: "Kerala",
        districts: ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"]
      },
      "madhya-pradesh": {
        name: "Madhya Pradesh",
        districts: ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Hoshangabad", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Mandla", "Mandsaur", "Morena", "Narsinghpur", "Neemuch", "Niwari", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"]
      },
      "maharashtra": {
        name: "Maharashtra",
        districts: ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"]
      },
      "manipur": {
        name: "Manipur",
        districts: ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"]
      },
      "meghalaya": {
        name: "Meghalaya",
        districts: ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"]
      },
      "mizoram": {
        name: "Mizoram",
        districts: ["Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Saitual", "Serchhip"]
      },
      "nagaland": {
        name: "Nagaland",
        districts: ["Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Noklak", "Peren", "Phek", "Tuensang", "Wokha", "Zunheboto"]
      },
      "odisha": {
        name: "Odisha",
        districts: ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"]
      },
      "punjab": {
        name: "Punjab",
        districts: ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga", "Muktsar", "Pathankot", "Patiala", "Rupnagar", "Sangrur", "SAS Nagar", "Shaheed Bhagat Singh Nagar", "Tarn Taran"]
      },
      "rajasthan": {
        name: "Rajasthan",
        districts: ["Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur"]
      },
      "sikkim": {
        name: "Sikkim",
        districts: ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"]
      },
      "tamil-nadu": {
        name: "Tamil Nadu",
        districts: ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupattur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"]
      },
      "telangana": {
        name: "Telangana",
        districts: ["Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Komaram Bheem Asifabad", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal Rural", "Warangal Urban", "Yadadri Bhuvanagiri"]
      },
      "tripura": {
        name: "Tripura",
        districts: ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"]
      },
      "uttar-pradesh": {
        name: "Uttar Pradesh",
        districts: ["Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shrawasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"]
      },
      "uttarakhand": {
        name: "Uttarakhand",
        districts: ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"]
      },
      "west-bengal": {
        name: "West Bengal",
        districts: ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"]
      },
      "andaman-nicobar": {
        name: "Andaman and Nicobar Islands",
        districts: ["Nicobar", "North and Middle Andaman", "South Andaman"]
      },
      "chandigarh": {
        name: "Chandigarh",
        districts: ["Chandigarh"]
      },
      "dadra-nagar-haveli": {
        name: "Dadra and Nagar Haveli and Daman and Diu",
        districts: ["Dadra and Nagar Haveli", "Daman", "Diu"]
      },
      "delhi": {
        name: "Delhi",
        districts: ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"]
      },
      "jammu-kashmir": {
        name: "Jammu and Kashmir",
        districts: ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"]
      },
      "ladakh": {
        name: "Ladakh",
        districts: ["Kargil", "Leh"]
      },
      "lakshadweep": {
        name: "Lakshadweep",
        districts: ["Lakshadweep"]
      },
      "puducherry": {
        name: "Puducherry",
        districts: ["Karaikal", "Mahe", "Puducherry", "Yanam"]
      }
    };

    res.json({
      success: true,
      data: stateDistrictData
    });
  } catch (error) {
    console.error('Error fetching states and districts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch states and districts data'
    });
  }
};