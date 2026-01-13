import app from './src/app.js';

const PORT = process.env.PORT || 4523;

app.get("/", (req, res) => {
  res.send("Welcome to the Ticket Booking API");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});