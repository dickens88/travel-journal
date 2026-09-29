// Chat and note days follow the device timezone; pin it for stable tests
module.exports = async () => {
  process.env.TZ = 'Asia/Tokyo';
};
