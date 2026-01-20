const Address = require('../../models/Address');
const User = require('../../models/User');

// ==================== ADD NEW ADDRESS ====================
const addAddress = async (req, res) => {
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

// ==================== UPDATE EXISTING ADDRESS ====================
const updateAddress = async (req, res) => {
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

// ==================== GET ALL ADDRESSES ====================
const getAddresses = async (req, res) => {
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

// ==================== GET SINGLE ADDRESS ====================
const getAddress = async (req, res) => {
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

// ==================== DELETE ADDRESS ====================
const deleteAddress = async (req, res) => {
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

// ==================== SET DEFAULT ADDRESS ====================
const setDefaultAddress = async (req, res) => {
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

// ==================== LOAD ADDRESSES PAGE ====================
const loadAddresses = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 2; // 2 addresses per page
    const skip = (page - 1) * limit;

    // Get all user addresses
    const userAddresses = await Address.findOne({ userId }).lean();
    const allAddresses = userAddresses ? userAddresses.address : [];
    
    // Calculate pagination
    const totalAddresses = allAddresses.length;
    const totalPages = Math.ceil(totalAddresses / limit) || 1;
    const currentPage = Math.min(page, totalPages); // Prevent going beyond last page
    
    // Get paginated addresses
    const addresses = allAddresses.slice(skip, skip + limit);

    console.log(`📍 Address Book - Page ${currentPage}/${totalPages} (${addresses.length} addresses, ${totalAddresses} total)`);

    res.render('user/address-book', {
      user,
      addresses,
      currentPage: currentPage,
      totalPages: totalPages,
      totalAddresses: totalAddresses, // ✅ Added for count display
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
      prevPage: currentPage - 1,
      nextPage: currentPage + 1,
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

// ==================== GET STATES AND DISTRICTS ====================
const getStatesAndDistricts = async (req, res) => {
  try {
    // Indian states and districts data
    const stateDistrictData = {
      "andhra-pradesh": {
        name: "Andhra Pradesh",
        districts: ["Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "Nellore", "Prakasam", "Srikakulam", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"]
      },
      // ... (keep all your existing state/district data)
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

// ==================== GET PAGINATED ADDRESSES (AJAX) ====================
const getAddressesPaginated = async (req, res) => {
  try {
    const userId = req.session.userId || (req.user && req.user._id);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please login to view addresses'
      });
    }

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 2; // 2 addresses per page
    const skip = (page - 1) * limit;

    console.log(`📡 AJAX: Fetching addresses page ${page} (limit: ${limit}, skip: ${skip})`);

    // Get all user addresses
    const userAddresses = await Address.findOne({ userId }).lean();
    const allAddresses = userAddresses ? userAddresses.address : [];

    // Calculate pagination
    const totalAddresses = allAddresses.length;
    const totalPages = Math.ceil(totalAddresses / limit) || 1;
    const currentPage = Math.min(page, totalPages); // Prevent going beyond last page
    
    // Get addresses for current page
    const addresses = allAddresses.slice(skip, skip + limit);

    console.log(`✅ AJAX: Returning ${addresses.length} addresses for page ${currentPage}/${totalPages}`);

    res.json({
      success: true,
      data: {
        addresses: addresses,
        currentPage: currentPage,
        totalPages: totalPages,
        totalAddresses: totalAddresses,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        prevPage: currentPage - 1,
        nextPage: currentPage + 1
      }
    });

  } catch (error) {
    console.error('Error fetching paginated addresses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses'
    });
  }
};

// ==================== EXPORTS ====================
module.exports = {
  addAddress,
  updateAddress,
  getAddresses,
  getAddress,
  deleteAddress,
  setDefaultAddress,
  loadAddresses,
  getStatesAndDistricts,
  getAddressesPaginated
};
