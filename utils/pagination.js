const getPagination = async (queryBuilder, model, filter, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [data, count] = await Promise.all([
    queryBuilder.skip(skip).limit(limit),
    model.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(count / limit);

  return { data, totalPages };
};

module.exports = getPagination;