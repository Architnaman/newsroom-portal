SELECT r.name, a.week_start_date, a.available_days 
FROM availability a
JOIN reporters r ON r.id = a.reporter_id;