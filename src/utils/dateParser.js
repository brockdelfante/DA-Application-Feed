export const parseDateSourced = (dateStr) => {
  if (!dateStr) return new Date(0);
  // Expected format: DD/MM/YYYY HH:mm
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  if (timePart) {
    const [hours, minutes] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }
  return new Date(year, month - 1, day);
};
