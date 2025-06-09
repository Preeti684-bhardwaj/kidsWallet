const express = require('express');
const router = express.Router();
const {
  createCategory,
  updateCategory,
  getAllCategories,
  getCategorieById,
  deleteCategory,
} = require('../Controllers/product/categoryController');
const {createInventoryLocation,getAllInventoryLocations,getInventoryLocationById,updateInventoryLocation,deleteInventoryLocation}=require('../Controllers/product/productLocationController')
const {createProduct,getAllProducts,getProductById,getProductsByCategory,updateProduct,deleteProduct,bulkUpdateProductStatus}=require('../Controllers/product/productController');
const {createProductVariant, getProductVariantById, updateProductVariant, deleteProductVariant, getAllProductVariants,getVariantsByProduct,bulkUpdateVariantStatus,getVariantStats} = require('../Controllers/product/productVariantController');
const {
  createInventory,
  getInventoryById,
  getAllInventories,
  updateInventory,
  deleteInventory,
  bulkUpdateInventory,
  getLowStockInventories,
  reserveInventory,
  releaseReservedInventory
} = require('../Controllers/product/productInventoryController');
const {
    authenticateUnifiedToken,
    authenticateToken,
    authenticateAdminToken
  } = require("../Middlewares/auth");
const upload = require("../Middlewares/multer");

//   CATEGORY ROUTES
router.post('/category/create', authenticateAdminToken, upload.single('image'), createCategory);
router.put('/category/update/:id', authenticateAdminToken,upload.single('image'),  updateCategory);
router.get('/category/all', authenticateAdminToken, getAllCategories);
router.get('/category/:id', authenticateAdminToken, getCategorieById);
router.delete('/category/delete/:id', authenticateAdminToken, deleteCategory);

//  INVENTORY LOCATION ROUTES
router.post('/inventory-location/create', authenticateAdminToken, createInventoryLocation);
router.get('/inventory-location/all', authenticateAdminToken, getAllInventoryLocations);
router.get('/inventory-location/:id', authenticateAdminToken, getInventoryLocationById);
router.put('/inventory-location/update/:id', authenticateAdminToken, updateInventoryLocation);
router.delete('/inventory-location/delete/:id', authenticateAdminToken, deleteInventoryLocation);

// PRODUCT ROUTES
router.post('/create',authenticateAdminToken,upload.array('images', 10), createProduct);
router.get('/all', getAllProducts);
router.get('/:id', getProductById);
router.put('/:id',authenticateAdminToken,upload.array('images', 10),updateProduct);
router.delete('/:id', authenticateAdminToken, deleteProduct);
router.get('/get_product_by_categoryId/:categoryId', getProductsByCategory);
router.put('/bulk/status', authenticateAdminToken, bulkUpdateProductStatus);

// PRODUCT VARIANT ROUTES
router.post(
  '/variants/create',
  authenticateAdminToken,
  upload.array('images', 10), // Allow up to 10 images
  createProductVariant
);
router.get('/variants/stats', getVariantStats);
router.get('/variants/all', getAllProductVariants);
router.get('/variants/:id', getProductVariantById);
router.put(
  '/variants/:id',
  authenticateAdminToken,
  upload.array('images', 10), // Allow up to 10 images
  updateProductVariant
);
router.delete('/variants/:id', authenticateAdminToken, deleteProductVariant);
router.get('/variants/get_by_productId/:productId', getVariantsByProduct);
router.put('/variants/bulk/status', authenticateAdminToken, bulkUpdateVariantStatus);

// PRODUCT INVENTORY ROUTES
router.post('/inventories/create', authenticateAdminToken, createInventory);
router.get('/inventories/all', getAllInventories);
router.get('/inventories/low-stock', getLowStockInventories);
router.get('/inventories/:id', getInventoryById);
router.put('/inventories/:id', authenticateAdminToken, updateInventory);
router.delete('/inventories/:id', authenticateAdminToken, deleteInventory);
router.put('/inventories/bulk/update', authenticateAdminToken, bulkUpdateInventory);
router.post('/inventories/:id/reserve', authenticateAdminToken, reserveInventory);
router.post('/inventories/:id/release', authenticateAdminToken, releaseReservedInventory);


module.exports = router;