const Address = require('../../models/Address');
const User = require('../../models/User');

// Backend address validation using Geoapify
const validateAddressWithGeoapify = async (addressData) => {
  const API_KEY = process.env.GEOAPIFY_API_KEY;
  const fullAddress = `${addressData.landMark}, ${addressData.city}, ${addressData.state}, ${addressData.pincode}`;
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(fullAddress)}&country=IN&format=json&apiKey=${API_KEY}`
    );
    const data = await response.json();

    return {
      isValid: data.results && data.results.length > 0,
      suggestions: data.results || [],
      coordinates: data.results && data.results.length > 0 ? {
        lat: data.results[0].lat,
        lon: data.results[0].lon
      } : null
    };
  } catch (error) {
    console.error('Geoapify validation error:', error);
    return {
      isValid: false,
      suggestions: [],
      coordinates: null
    };
  }
};

// Check for duplicate addresses using coordinates
const checkDuplicateAddress = (newCoordinates, existingAddresses) => {
  if (!newCoordinates || !newCoordinates.lat || !newCoordinates.lon) return false;
  
  const threshold = 0.001; // ~100 meters
  
  return existingAddresses.some(existing => {
    if (!existing.coordinates || !existing.coordinates.lat || !existing.coordinates.lon) return false;
    
    const latDiff = Math.abs(existing.coordinates.lat - newCoordinates.lat);
    const lonDiff = Math.abs(existing.coordinates.lon - newCoordinates.lon);
    
    return latDiff < threshold && lonDiff < threshold;
  });
};

// Validation functions
const validateAddressData = (data) => {
  const errors = {};

  // Validate name
  if (!data.name || data.name.trim().length < 4) {
    errors.name = 'Full name must be at least 4 characters long';
  } else if (!/^[a-zA-Z\s]+$/.test(data.name.trim())) {
    errors.name = 'Full name can only contain alphabets and spaces';
  }

  // Validate phone
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.trim())) {
    errors.phone = 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9';
  }

  // Validate alternative phone (optional)
  if (data.altPhone && data.altPhone.trim() && !/^[6-9]\d{9}$/.test(data.altPhone.trim())) {
    errors.altPhone = 'Please enter a valid 10-digit alternative phone number starting with 6, 7, 8, or 9';
  }

  // Validate address details
  if (!data.landMark || data.landMark.trim().length < 10) {
    errors.landMark = 'Address details must be at least 10 characters long';
  }

  // Validate state
  if (!data.state || data.state.trim() === '') {
    errors.state = 'Please select a state';
  }

  // Validate city
  if (!data.city || data.city.trim().length < 2) {
    errors.city = 'City must be at least 2 characters long';
  } else if (!/^[a-zA-Z\s]+$/.test(data.city.trim())) {
    errors.city = 'City can only contain alphabets and spaces';
  }

  // Validate pincode
  if (!data.pincode || !/^[1-9]\d{5}$/.test(data.pincode.toString().trim())) {
    errors.pincode = 'Please enter a valid 6-digit pincode that does not start with 0';
  }

  // Validate address type
  if (!data.addressType || !['home', 'office', 'other'].includes(data.addressType)) {
    errors.addressType = 'Please select a valid address type';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
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

    const { fullName, mobileNumber, altPhone, addressDetails, state, district, city, pincode, landmark, addressType, makeDefault, coordinates } = req.body;

    // Prepare address data for validation
    const addressData = {
      name: fullName,
      phone: mobileNumber,
      altPhone: altPhone || '',
      landMark: addressDetails,
      state,
      city,
      pincode: parseInt(pincode),
      addressType
    };

    // Validate address data
    const validation = validateAddressData(addressData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    // Backend address validation with Geoapify
    const geoapifyValidation = await validateAddressWithGeoapify(addressData);
    if (!geoapifyValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Unable to validate the address. Please check your address details and try again.'
      });
    }

    // Use coordinates from frontend or from backend validation
    const finalCoordinates = coordinates || geoapifyValidation.coordinates;

    // Check for duplicate addresses (only for new addresses)
    const userAddresses = await Address.findOne({ userId });
    if (userAddresses && finalCoordinates) {
      const isDuplicate = checkDuplicateAddress(finalCoordinates, userAddresses.address);
      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: 'This address appears to be very similar to an existing address. Please check your saved addresses.'
        });
      }
    }

    // Create new address object
    const newAddress = {
      addressType,
      name: fullName.trim(),
      city: city.trim(),
      landMark: addressDetails.trim(),
      state,
      pincode: parseInt(pincode),
      phone: mobileNumber.trim(),
      altPhone: altPhone ? altPhone.trim() : '',
      isDefault: makeDefault || false,
      coordinates: finalCoordinates
    };

    // Find user's address document or create new one
    let userAddressDoc = userAddresses;

    if (!userAddressDoc) {
      // Create new address document for user
      userAddressDoc = new Address({
        userId,
        address: [newAddress]
      });
    } else {
      // If making this default, unset other defaults
      if (makeDefault) {
        userAddressDoc.address.forEach(addr => {
          addr.isDefault = false;
        });
      }
      
      // Add new address to existing document
      userAddressDoc.address.push(newAddress);
    }

    await userAddressDoc.save();

    res.json({
      success: true,
      message: 'Address added successfully',
      address: newAddress
    });

  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address'
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

    const { fullName, mobileNumber, altPhone, addressDetails, state, district, city, pincode, landmark, addressType, makeDefault } = req.body;

    // Prepare address data for validation
    const addressData = {
      name: fullName,
      phone: mobileNumber,
      altPhone: altPhone || '',
      landMark: addressDetails,
      state,
      city,
      pincode: parseInt(pincode),
      addressType
    };

    // Validate address data
    const validation = validateAddressData(addressData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
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

    // If making this default, unset other defaults
    if (makeDefault) {
      userAddresses.address.forEach(addr => {
        addr.isDefault = false;
      });
    }

    // Update the address
    userAddresses.address[addressIndex] = {
      ...userAddresses.address[addressIndex],
      addressType,
      name: fullName.trim(),
      city: city.trim(),
      landMark: addressDetails.trim(),
      state,
      pincode: parseInt(pincode),
      phone: mobileNumber.trim(),
      altPhone: altPhone ? altPhone.trim() : '',
      isDefault: makeDefault || false
    };

    await userAddresses.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      address: userAddresses.address[addressIndex]
    });

  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address'
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

// Get single address
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
    const userAddresses = await Address.findOne({ userId });

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

// Load add address page
exports.loadAddAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    const returnTo = req.query.returnTo || '';

    res.render('user/add-address', {
      user,
      returnTo,
      title: 'Add Address - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'addresses'
    });
  } catch (error) {
    console.error('Error loading add address page:', error);
    res.status(500).render('error', { message: 'Error loading add address page' });
  }
};

// Load edit address page
exports.loadEditAddress = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    const addressId = req.params.addressId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Find user's address document
    const userAddresses = await Address.findOne({ userId });

    if (!userAddresses) {
      return res.redirect('/profile/addresses');
    }

    // Find the specific address
    const address = userAddresses.address.find(addr => addr._id.toString() === addressId);

    if (!address) {
      return res.redirect('/profile/addresses');
    }

    const returnTo = req.query.returnTo || '';

    res.render('user/edit-address', {
      user,
      address,
      returnTo,
      isEdit: true,
      title: 'Edit Address - LacedUp',
      layout: 'user/layouts/user-layout',
      active: 'addresses'
    });
  } catch (error) {
    console.error('Error loading edit address page:', error);
    res.status(500).render('error', { message: 'Error loading edit address page' });
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