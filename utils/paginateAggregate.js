/**
 * Paginate MongoDB aggregation pipelines using $facet
 * @param {Model} model - Mongoose model
 * @param {Array} pipeline - Aggregation pipeline array
 * @param {number} page - Current page (1-based)
 * @param {number} limit - Items per page
 * @returns {Object} { data, totalPages, count }
 */
exports.paginateAggregate = async (model, pipeline, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  const facetPipeline = [
    ...pipeline,
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit }
        ],
        count: [
          { $count: "total" }
        ]
      }
    }
  ];
  
  const [result] = await model.aggregate(facetPipeline);
  
  const data = result.data || [];
  const count = result.count[0]?.total || 0;
  const totalPages = Math.ceil(count / limit);
  
  return {
    data,
    totalPages,
    count,
    currentPage: page,
    limit
  };
};