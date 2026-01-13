import axios from 'axios';

const API_URL = 'http://localhost:4521';

const TOTAL_REQUESTS = 20;
const INITIAL_CAPACITY = 5; 

const runTest = async () => {
  try {
    console.log(`\n--- STARTING CONCURRENCY TEST ---`);

    console.log(`Creating test event with capacity: ${INITIAL_CAPACITY}...`);
    const eventResponse = await axios.post(`${API_URL}/events/create`, {
      name: "Concurrency Test Concert",
      sections: [
        { name: "VIP", price: 100, capacity: INITIAL_CAPACITY }
      ]
    });

    const eventId = eventResponse.data._id;
    const sectionId = eventResponse.data.sections[0]._id;
    console.log(`Event Created! ID: ${eventId}`);
    console.log(`Section Created! ID: ${sectionId}`);
    console.log(`\nSimulating ${TOTAL_REQUESTS} parallel booking requests...`);
    
    const bookingPromises = [];
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      const request = axios.post(`${API_URL}/book`, {
        eventId,
        sectionId,
        qty: 1
      })
      .then(res => ({ status: 'success', data: res.data }))
      .catch(err => ({ status: 'failed', error: err.response?.data?.error || err.message }));
      
      bookingPromises.push(request);
    }

    const results = await Promise.all(bookingPromises);

    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = results.filter(r => r.status === 'failed').length;

    console.log(`\n--- RESULTS ---`);
    console.log(`Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`Successful Bookings: ${successCount}`);
    console.log(`Failed Bookings:     ${failCount}`);

    const finalEventRes = await axios.get(`${API_URL}/events/${eventId}`);
    const finalRemaining = finalEventRes.data.sections[0].remaining;

    console.log(`\nFinal DB State:`);
    console.log(`Remaining Seats: ${finalRemaining}`);

    if (successCount === INITIAL_CAPACITY && finalRemaining === 0) {
      console.log(`\n✅ TEST PASSED: Perfectly sold out without overselling.`);
    } else if (successCount > INITIAL_CAPACITY) {
      console.log(`\n❌ TEST FAILED: Overselling occurred! (Sold ${successCount} tickets, Capacity was ${INITIAL_CAPACITY})`);
    } else if (finalRemaining < 0) {
      console.log(`\n❌ TEST FAILED: Remaining seats are negative!`);
    } else {
      console.log(`\n⚠️ TEST INCONCLUSIVE: Check logic.`);
    }

  } catch (error) {
    console.error('Test script error:', error.message);
  }
};

runTest();